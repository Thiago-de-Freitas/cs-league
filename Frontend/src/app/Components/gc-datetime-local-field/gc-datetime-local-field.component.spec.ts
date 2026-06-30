import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { GcDatetimeLocalFieldComponent } from './gc-datetime-local-field.component';

describe('GcDatetimeLocalFieldComponent', () => {
  let fixture: ComponentFixture<GcDatetimeLocalFieldComponent>;
  let component: GcDatetimeLocalFieldComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormsModule, GcDatetimeLocalFieldComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(GcDatetimeLocalFieldComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('divide e recompõe valor datetime-local', () => {
    let emitted = '';
    component.registerOnChange((value) => {
      emitted = value;
    });

    component.writeValue('2026-05-22T15:01');
    expect(component.datePart).toBe('2026-05-22');
    expect(component.timePart).toBe('15:01');

    component.datePart = '2026-06-01';
    component.timePart = '20:30';
    component.onPartChange();
    expect(emitted).toBe('2026-06-01T20:30');
  });

  it('limpa valor quando data é removida', () => {
    component.writeValue('2026-05-22T15:01');
    let emitted = 'pending';
    component.registerOnChange((value) => {
      emitted = value;
    });

    component.datePart = '';
    component.onPartChange();

    expect(emitted).toBe('');
  });
});
