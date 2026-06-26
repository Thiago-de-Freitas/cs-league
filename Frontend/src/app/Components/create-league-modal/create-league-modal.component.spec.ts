import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { CreateLeagueModalComponent } from './create-league-modal.component';
import { LeagueService } from '../../Services/league.service';
import { League } from '../../Models/interfaces';

describe('CreateLeagueModalComponent', () => {
  let component: CreateLeagueModalComponent;
  let fixture: ComponentFixture<CreateLeagueModalComponent>;
  let leagueServiceSpy: jasmine.SpyObj<LeagueService>;

  const mockLeague: League = {
    id: 'l1',
    name: 'Test League',
    description: '',
    teams: [],
    status: 'upcoming',
  };

  beforeEach(async () => {
    leagueServiceSpy = jasmine.createSpyObj('LeagueService', ['createLeague']);
    leagueServiceSpy.createLeague.and.returnValue(of(mockLeague));

    await TestBed.configureTestingModule({
      imports: [CreateLeagueModalComponent, ReactiveFormsModule],
      providers: [{ provide: LeagueService, useValue: leagueServiceSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(CreateLeagueModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('cria o componente', () => {
    expect(component).toBeTruthy();
  });

  it('showMapSeriesOptions para eliminatória e grupos', () => {
    component.form.patchValue({ format: 'single_elimination' });
    expect(component.showMapSeriesOptions).toBeTrue();
    component.form.patchValue({ format: 'single_group' });
    expect(component.showMapSeriesOptions).toBeTrue();
    component.form.patchValue({ format: 'swiss' });
    expect(component.showMapSeriesOptions).toBeFalse();
  });

  it('rejeita BO3 com pool insuficiente no submit', () => {
    component.form.patchValue({ leagueName: 'Liga BO3', format: 'single_elimination' });
    component.seriesFormat = 'bo3';
    component.mapPool = ['de_dust2', 'de_mirage'];
    component.onSubmit();
    expect(component.errorMessage).toContain('5 mapas');
    expect(leagueServiceSpy.createLeague).not.toHaveBeenCalled();
  });

  it('envia mapVetoEnabled true no BO3 mesmo se desmarcado', () => {
    component.form.patchValue({ leagueName: 'Liga BO3', format: 'single_elimination' });
    component.seriesFormat = 'bo3';
    component.mapVetoEnabled = false;
    component.mapPool = ['de_ancient', 'de_anubis', 'de_dust2', 'de_inferno', 'de_mirage'];
    component.onSubmit();
    expect(leagueServiceSpy.createLeague).toHaveBeenCalledWith(
      jasmine.objectContaining({
        seriesFormat: 'bo3',
        mapVetoEnabled: true,
        mapPool: jasmine.any(Array),
      })
    );
  });

  it('BO1 sem veto não envia mapVetoEnabled true forçado', () => {
    component.form.patchValue({ leagueName: 'Liga BO1', format: 'single_elimination' });
    component.seriesFormat = 'bo1';
    component.mapVetoEnabled = false;
    component.mapPool = ['de_dust2', 'de_mirage'];
    component.onSubmit();
    expect(leagueServiceSpy.createLeague).toHaveBeenCalledWith(
      jasmine.objectContaining({
        seriesFormat: 'bo1',
        mapVetoEnabled: false,
      })
    );
  });

  it('mapSeriesScopeHint muda com formato de liga', () => {
    component.form.patchValue({ format: 'one_vs_one' });
    expect(component.mapSeriesScopeHint).toContain('partida desta liga');
    component.form.patchValue({ format: 'single_group' });
    expect(component.mapSeriesScopeHint).toContain('fase de grupos');
  });

  it('liga individual envia pickupBalanceModes e playersPerTeam', () => {
    component.form.patchValue({
      leagueName: 'Duelo',
      format: 'one_vs_one',
      pickupPlayersPerTeam: 3,
    });
    component.pickupBalanceModes = ['rating', 'adr'];
    component.onSubmit();
    expect(leagueServiceSpy.createLeague).toHaveBeenCalledWith(
      jasmine.objectContaining({
        format: 'ONE_VS_ONE',
        pickupPlayersPerTeam: 3,
        pickupBalanceModes: ['rating', 'adr'],
      })
    );
  });

  it('togglePickupBalanceMode impede remover último critério', () => {
    component.pickupBalanceModes = ['rating'];
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = false;
    component.togglePickupBalanceMode('rating', { target: input } as unknown as Event);
    expect(component.pickupBalanceModes).toEqual(['rating']);
    expect(input.checked).toBeTrue();
  });

  it('minTeamsForFormat retorna 2 para liga individual', () => {
    component.form.patchValue({ format: 'one_vs_one' });
    expect(component.minTeamsForFormat).toBe(2);
  });
});
