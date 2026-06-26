import { Router, Response } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { participationGuard } from '../middleware/participationGuard';
import { canUserAccessMatch, canUserRegisterMatchResult } from '../lib/matchPermissions';
import { isValidMapId } from '../lib/cs2Maps';
import {
  banMapForMatch,
  ensureMatchMapVeto,
  pickSideForMatch,
  reopenMatchMapVeto,
  upsertMatchLineup,
} from '../lib/mapVetoService';
import { buildVetoDeadlineInfo } from '../lib/mapVetoDeadline';
import { buildHighlightsListResponse, sendHighlightClipSpec, sendHighlightVideo } from '../lib/highlightHttp';
import {
  enqueueHighlightExtractJob,
  findLatestCompletedDemoForMatch,
} from '../lib/highlightExtractQueue';
import { requireDemoQueue } from '../middleware/demoQueue';
import { getSeriesForMatch } from '../lib/matchSeriesService';
import { encodeUploadedImageToDataUrl } from '../lib/uploadAssets';
import { setAuditContext } from '../lib/audit';
import { audit } from '../lib/audit';

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

async function loadMatchContext(matchId: string) {
  return prisma.match.findUnique({
    where: { id: matchId },
    include: {
      league: {
        select: {
          id: true,
          ownerId: true,
          format: true,
          mapPool: true,
          mapVetoEnabled: true,
        },
      },
      lineup: true,
      images: { orderBy: { createdAt: 'desc' } },
      highlights: { orderBy: [{ score: 'desc' }, { round: 'asc' }] },
      mapVeto: true,
    },
  });
}

async function assertCaptainOrAdmin(
  userId: string,
  role: string,
  matchId: string,
  team1Id: string,
  team2Id: string,
  leagueOwnerId: string
): Promise<{ ok: boolean; captainTeamIds: string[]; error?: string }> {
  if (role === 'ADMIN' || leagueOwnerId === userId) {
    return { ok: true, captainTeamIds: [team1Id, team2Id] };
  }
  const captains = await prisma.teamMember.findMany({
    where: {
      userId,
      teamId: { in: [team1Id, team2Id] },
      role: 'CAPTAIN',
    },
    select: { teamId: true },
  });
  if (captains.length === 0) {
    return { ok: false, captainTeamIds: [], error: 'Apenas capitães podem realizar esta ação.' };
  }
  return { ok: true, captainTeamIds: captains.map((c) => c.teamId) };
}

export function registerMatchExtras(router: Router): void {
  router.get('/:id/map-veto', async (req: AuthRequest, res: Response) => {
    try {
      const access = await canUserAccessMatch(req.user!.userId, req.user!.role, req.params.id);
      if (!access.allowed) {
        res.status(403).json({ error: access.error });
        return;
      }
      const match = await loadMatchContext(req.params.id);
      if (!match) {
        res.status(404).json({ error: 'Partida não encontrada' });
        return;
      }
      if (!match.league.mapVetoEnabled) {
        res.json({ enabled: false, veto: null });
        return;
      }
      const veto = await ensureMatchMapVeto(match);
      const resultAccess = await canUserRegisterMatchResult(req.user!.userId, req.user!.role, match.id);
      const deadline = buildVetoDeadlineInfo(match.scheduledAt, veto?.vetoReopenedByAdmin ?? false);
      const canAdminReopen = req.user!.role === 'ADMIN' && deadline.deadlineExpired;
      res.json({
        enabled: true,
        veto,
        canAct: resultAccess.allowed && !deadline.deadlineExpired,
        canAdminReopen,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao carregar veto de mapas' });
    }
  });

  router.post('/:id/map-veto/ban', authMiddleware, participationGuard, async (req: AuthRequest, res: Response) => {
    try {
      const match = await loadMatchContext(req.params.id);
      if (!match) {
        res.status(404).json({ error: 'Partida não encontrada' });
        return;
      }
      const perm = await assertCaptainOrAdmin(
        req.user!.userId,
        req.user!.role,
        match.id,
        match.team1Id,
        match.team2Id,
        match.league.ownerId
      );
      if (!perm.ok) {
        res.status(403).json({ error: perm.error });
        return;
      }
      const mapId = String(req.body?.map ?? '').trim();
      if (!isValidMapId(mapId)) {
        res.status(400).json({ error: 'Mapa inválido' });
        return;
      }
      const actingTeamId = perm.captainTeamIds.find((id) => id === match.mapVeto?.vetoTurnTeamId);
      if (!actingTeamId) {
        res.status(403).json({ error: 'Não é a vez do seu time banir.' });
        return;
      }
      const { veto, error } = await banMapForMatch(match, actingTeamId, mapId);
      if (error) {
        res.status(400).json({ error, veto });
        return;
      }
      setAuditContext(req, audit.withParent('match.map_veto.ban', 'Match', match.id, 'League', match.leagueId, {
        after: { map: mapId, veto },
      }));
      res.json({ veto });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao banir mapa' });
    }
  });

  router.post('/:id/map-veto/reopen', async (req: AuthRequest, res: Response) => {
    try {
      if (req.user!.role !== 'ADMIN') {
        res.status(403).json({ error: 'Apenas administradores podem reabrir o veto de mapas.' });
        return;
      }

      const match = await loadMatchContext(req.params.id);
      if (!match) {
        res.status(404).json({ error: 'Partida não encontrada' });
        return;
      }
      if (!match.league.mapVetoEnabled) {
        res.status(400).json({ error: 'Veto de mapas desativado nesta liga.' });
        return;
      }

      const deadline = buildVetoDeadlineInfo(match.scheduledAt, match.mapVeto?.vetoReopenedByAdmin ?? false);
      if (!deadline.deadlineExpired) {
        res.status(400).json({ error: 'O prazo de veto ainda não expirou.' });
        return;
      }

      if (!match.mapVeto) {
        await ensureMatchMapVeto(match);
      }

      const veto = await reopenMatchMapVeto(match);
      setAuditContext(req, audit.withParent('match.map_veto.reopen', 'Match', match.id, 'League', match.leagueId));
      res.json({ veto });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao reabrir veto de mapas.' });
    }
  });

  router.post('/:id/map-veto/side', authMiddleware, participationGuard, async (req: AuthRequest, res: Response) => {
    try {
      const match = await loadMatchContext(req.params.id);
      if (!match) {
        res.status(404).json({ error: 'Partida não encontrada' });
        return;
      }
      const perm = await assertCaptainOrAdmin(
        req.user!.userId,
        req.user!.role,
        match.id,
        match.team1Id,
        match.team2Id,
        match.league.ownerId
      );
      if (!perm.ok) {
        res.status(403).json({ error: perm.error });
        return;
      }
      const side = String(req.body?.side ?? '').toUpperCase();
      if (side !== 'CT' && side !== 'T') {
        res.status(400).json({ error: 'Lado inválido. Use CT ou T.' });
        return;
      }
      const actingTeamId = perm.captainTeamIds.find((id) => id === match.mapVeto?.sidePickTeamId);
      if (!actingTeamId) {
        res.status(403).json({ error: 'Não é a vez do seu time escolher o lado.' });
        return;
      }
      const { veto, error } = await pickSideForMatch(match, actingTeamId, side as 'CT' | 'T');
      if (error) {
        res.status(400).json({ error, veto });
        return;
      }
      setAuditContext(req, audit.withParent('match.map_veto.side', 'Match', match.id, 'League', match.leagueId, {
        after: { side, veto },
      }));
      res.json({ veto });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao escolher lado' });
    }
  });

  router.put('/:id/lineup', authMiddleware, participationGuard, async (req: AuthRequest, res: Response) => {
    try {
      const match = await loadMatchContext(req.params.id);
      if (!match) {
        res.status(404).json({ error: 'Partida não encontrada' });
        return;
      }
      const isOwner = match.league.ownerId === req.user!.userId || req.user!.role === 'ADMIN';
      const perm = await assertCaptainOrAdmin(
        req.user!.userId,
        req.user!.role,
        match.id,
        match.team1Id,
        match.team2Id,
        match.league.ownerId
      );
      if (!isOwner && !perm.ok) {
        res.status(403).json({ error: 'Sem permissão para definir lineup.' });
        return;
      }
      const { team1PlayerUserId, team2PlayerUserId } = req.body ?? {};
      if (!team1PlayerUserId || !team2PlayerUserId) {
        res.status(400).json({ error: 'Informe um jogador por time.' });
        return;
      }
      const members = await prisma.teamMember.findMany({
        where: {
          OR: [
            { teamId: match.team1Id, userId: team1PlayerUserId },
            { teamId: match.team2Id, userId: team2PlayerUserId },
          ],
        },
      });
      const hasT1 = members.some((m) => m.teamId === match.team1Id && m.userId === team1PlayerUserId);
      const hasT2 = members.some((m) => m.teamId === match.team2Id && m.userId === team2PlayerUserId);
      if (!hasT1 || !hasT2) {
        res.status(400).json({ error: 'Jogadores devem pertencer aos times da partida.' });
        return;
      }
      await upsertMatchLineup(
        match.id,
        match.team1Id,
        match.team2Id,
        team1PlayerUserId,
        team2PlayerUserId
      );
      const lineup = await prisma.matchLineup.findMany({
        where: { matchId: match.id },
        include: {
          match: false,
        },
      });
      const users = await prisma.user.findMany({
        where: { id: { in: [team1PlayerUserId, team2PlayerUserId] } },
        select: { id: true, displayName: true, steamId: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));
      res.json({
        lineup: lineup.map((l) => ({
          teamId: l.teamId,
          userId: l.userId,
          playerName: userMap.get(l.userId)?.displayName ?? 'Jogador',
          steamId: userMap.get(l.userId)?.steamId ?? null,
        })),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao salvar lineup' });
    }
  });

  router.get('/:id/images', async (req: AuthRequest, res: Response) => {
    try {
      const access = await canUserAccessMatch(req.user!.userId, req.user!.role, req.params.id);
      if (!access.allowed) {
        res.status(403).json({ error: access.error });
        return;
      }
      const images = await prisma.matchImage.findMany({
        where: { matchId: req.params.id },
        orderBy: { createdAt: 'desc' },
      });
      res.json(images);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao listar imagens' });
    }
  });

  router.post('/:id/images', authMiddleware, participationGuard, imageUpload.single('image'), async (req: AuthRequest, res: Response) => {
    try {
      const access = await canUserAccessMatch(req.user!.userId, req.user!.role, req.params.id);
      if (!access.allowed) {
        res.status(403).json({ error: access.error });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'Imagem é obrigatória' });
        return;
      }
      const imageUrl = (() => {
        try {
          return encodeUploadedImageToDataUrl(req.file!);
        } catch (err) {
          return null;
        }
      })();
      if (!imageUrl) {
        res.status(400).json({ error: 'Formato de imagem inválido. Use PNG, JPEG ou WebP.' });
        return;
      }
      const caption = typeof req.body?.caption === 'string' ? req.body.caption.trim().slice(0, 200) : null;
      const image = await prisma.matchImage.create({
        data: {
          matchId: req.params.id,
          imageUrl,
          caption,
          uploadedById: req.user!.userId,
        },
      });
      res.status(201).json(image);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao enviar imagem' });
    }
  });

  router.delete('/:id/images/:imageId', async (req: AuthRequest, res: Response) => {
    try {
      const image = await prisma.matchImage.findFirst({
        where: { id: req.params.imageId, matchId: req.params.id },
      });
      if (!image) {
        res.status(404).json({ error: 'Imagem não encontrada' });
        return;
      }
      const match = await prisma.match.findUnique({
        where: { id: req.params.id },
        include: { league: { select: { ownerId: true } } },
      });
      const canDelete =
        req.user!.role === 'ADMIN'
        || match?.league.ownerId === req.user!.userId
        || image.uploadedById === req.user!.userId;
      if (!canDelete) {
        res.status(403).json({ error: 'Sem permissão' });
        return;
      }
      await prisma.matchImage.delete({ where: { id: image.id } });
      res.status(204).send();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao remover imagem' });
    }
  });

  router.get('/:id/highlights', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const access = await canUserAccessMatch(req.user!.userId, req.user!.role, req.params.id);
      if (!access.allowed) {
        res.status(403).json({ error: access.error });
        return;
      }
      const highlights = await prisma.matchHighlight.findMany({
        where: { matchId: req.params.id },
        orderBy: [{ score: 'desc' }, { round: 'asc' }],
      });
      res.json(buildHighlightsListResponse(highlights, { matchId: req.params.id }));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao listar highlights' });
    }
  });

  router.get('/:id/highlights/:highlightId/clip', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const access = await canUserAccessMatch(req.user!.userId, req.user!.role, req.params.id);
      if (!access.allowed) {
        res.status(403).json({ error: access.error });
        return;
      }
      const highlight = await prisma.matchHighlight.findFirst({
        where: { id: req.params.highlightId, matchId: req.params.id },
      });
      if (!highlight) {
        res.status(404).json({ error: 'Destaque não encontrado' });
        return;
      }
      if (highlight.clipStartTick == null || highlight.clipEndTick == null) {
        res.status(400).json({
          error: 'Este destaque não possui ticks de clipe. Reprocesse a demo após atualizar o worker.',
        });
        return;
      }

      sendHighlightClipSpec(res, highlight);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao exportar clipe' });
    }
  });

  router.get('/:id/highlights/:highlightId/video', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const access = await canUserAccessMatch(req.user!.userId, req.user!.role, req.params.id);
      if (!access.allowed) {
        res.status(403).json({ error: access.error });
        return;
      }
      const highlight = await prisma.matchHighlight.findFirst({
        where: { id: req.params.highlightId, matchId: req.params.id },
      });
      if (!highlight) {
        res.status(404).json({ error: 'Destaque não encontrado' });
        return;
      }
      sendHighlightVideo(res, highlight);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao baixar vídeo do destaque' });
    }
  });

  router.post('/:id/highlights/generate', authMiddleware, requireDemoQueue, async (req: AuthRequest, res: Response) => {
    try {
      const access = await canUserAccessMatch(req.user!.userId, req.user!.role, req.params.id);
      if (!access.allowed) {
        res.status(403).json({ error: access.error });
        return;
      }
      const demoId = await findLatestCompletedDemoForMatch(req.params.id);
      if (!demoId) {
        res.status(400).json({ error: 'Nenhuma demo processada encontrada para esta partida' });
        return;
      }
      await enqueueHighlightExtractJob(demoId);
      setAuditContext(req, audit.of('match.highlights.generate', 'Match', req.params.id, {
        metadata: { demoId },
      }));
      res.status(202).json({
        ok: true,
        demoId,
        message: 'Geração de destaques enfileirada. Atualize a página em instantes.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao gerar destaques';
      if (message.includes('não encontrado') || message.includes('processada') || message.includes('manuais')) {
        res.status(400).json({ error: message });
        return;
      }
      console.error(err);
      res.status(500).json({ error: 'Erro ao gerar destaques' });
    }
  });

  router.get('/:id/series', async (req: AuthRequest, res: Response) => {
    try {
      const access = await canUserAccessMatch(req.user!.userId, req.user!.role, req.params.id);
      if (!access.allowed) {
        res.status(403).json({ error: access.error });
        return;
      }
      const data = await getSeriesForMatch(req.params.id);
      if (!data) {
        res.json({ series: null, matches: [] });
        return;
      }
      res.json(data);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao carregar série' });
    }
  });
}
