import fs from 'fs';
import { prisma } from './prisma';
import { deleteLegacyUploadFile } from './uploadAssets';
import { tryResolveDemoFilePath } from './demoStorage';

export async function deleteUserAndData(userId: string): Promise<void> {
  const demos = await prisma.demo.findMany({
    where: { uploadedById: userId },
    select: { id: true, filePath: true },
  });

  for (const demo of demos) {
    if (demo.filePath) {
      const resolved = tryResolveDemoFilePath(demo.filePath);
      if (resolved && fs.existsSync(resolved)) {
        try {
          fs.unlinkSync(resolved);
        } catch {
          // ignore missing files
        }
      }
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true },
  });
  if (user?.avatarUrl) {
    deleteLegacyUploadFile(user.avatarUrl);
  }

  await prisma.$transaction([
    prisma.demo.deleteMany({ where: { uploadedById: userId } }),
    prisma.matchLineup.deleteMany({ where: { userId } }),
    prisma.matchImage.deleteMany({ where: { uploadedById: userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}
