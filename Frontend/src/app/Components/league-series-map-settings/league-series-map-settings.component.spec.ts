import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LeagueSeriesMapSettingsComponent } from './league-series-map-settings.component';
import { DEFAULT_MAP_POOL } from '../../Utils/maps';

describe('LeagueSeriesMapSettingsComponent', () => {
  let fixture: ComponentFixture<LeagueSeriesMapSettingsComponent>;
  let component: LeagueSeriesMapSettingsComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeagueSeriesMapSettingsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(LeagueSeriesMapSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('cria o componente', () => {
    expect(component).toBeTruthy();
  });

  it('BO3 exibe passos de veto e pool obrigatório', () => {
    component.seriesFormat = 'bo3';
    fixture.detectChanges();
    expect(component.vetoSteps.length).toBe(4);
    expect(component.showMapPool).toBeTrue();
    expect(component.mapPoolHint).toContain('5 mapas');
  });

  it('BO1 sem veto oculta pool e passos', () => {
    component.seriesFormat = 'bo1';
    component.mapVetoEnabled = false;
    fixture.detectChanges();
    expect(component.showMapPool).toBeFalse();
    expect(component.vetoSteps.length).toBe(0);
    expect(component.vetoFlowDescription).toContain('registrar o resultado');
  });

  it('validate rejeita pool insuficiente no BO3', () => {
    component.seriesFormat = 'bo3';
    expect(component.validate(['de_dust2', 'de_mirage'])).toBeFalse();
    expect(component.validationError).toContain('5 mapas');
  });

  it('onFormatChange emite BO3 e força veto', () => {
    spyOn(component.seriesFormatChange, 'emit');
    spyOn(component.mapVetoEnabledChange, 'emit');
    component.onFormatChange('bo3');
    expect(component.seriesFormatChange.emit).toHaveBeenCalledWith('bo3');
    expect(component.mapVetoEnabledChange.emit).toHaveBeenCalledWith(true);
  });

  it('onFormatChange com pool pequeno restaura DEFAULT_MAP_POOL', () => {
    spyOn(component.mapPoolChange, 'emit');
    component.mapPool = ['de_dust2', 'de_mirage'];
    component.onFormatChange('bo3');
    expect(component.mapPoolChange.emit).toHaveBeenCalledWith([...DEFAULT_MAP_POOL]);
  });
});
