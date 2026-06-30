import { CommonModule } from '@angular/common';
import { Component, forwardRef, Input } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { NativeInputPickerDirective } from '../../Directives/native-input-picker.directive';
import { openNativeInputPicker } from '../../Utils/native-input-picker.util';

@Component({
  selector: 'app-gc-datetime-local-field',
  standalone: true,
  imports: [CommonModule, FormsModule, NativeInputPickerDirective],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => GcDatetimeLocalFieldComponent),
      multi: true,
    },
  ],
  template: `
    <div class="gc-datetime-split" [class.is-disabled]="disabled">
      <div class="gc-datetime-split-part">
        <div class="gc-native-datetime-field">
          <input
            #dateInput
            [id]="dateInputId"
            type="date"
            class="input-field gc-native-datetime-input"
            [(ngModel)]="datePart"
            (ngModelChange)="onPartChange()"
            [disabled]="disabled"
            appNativeInputPicker />
          <button
            type="button"
            class="gc-native-datetime-trigger"
            (mousedown)="onTriggerMouseDown($event, dateInput)"
            [disabled]="disabled"
            aria-label="Abrir calendário"
            title="Abrir calendário">
            <span class="gc-native-datetime-icon" aria-hidden="true"></span>
          </button>
        </div>
      </div>
      <div class="gc-datetime-split-part gc-datetime-split-time">
        <div class="gc-native-datetime-field">
          <input
            #timeInput
            [id]="timeInputId"
            type="time"
            class="input-field gc-native-datetime-input"
            [(ngModel)]="timePart"
            (ngModelChange)="onPartChange()"
            [disabled]="disabled"
            appNativeInputPicker />
          <button
            type="button"
            class="gc-native-datetime-trigger"
            (mousedown)="onTriggerMouseDown($event, timeInput)"
            [disabled]="disabled"
            aria-label="Abrir seletor de horário"
            title="Abrir seletor de horário">
            <span class="gc-native-datetime-icon gc-native-datetime-icon--time" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    </div>
  `,
})
export class GcDatetimeLocalFieldComponent implements ControlValueAccessor {
  @Input() id = 'gc-datetime';
  @Input() disabled = false;

  datePart = '';
  timePart = '';

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  get dateInputId(): string {
    return `${this.id}-date`;
  }

  get timeInputId(): string {
    return `${this.id}-time`;
  }

  writeValue(value: string | null): void {
    this.applyValue(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onPartChange(): void {
    if (!this.datePart) {
      this.emitValue('');
      return;
    }
    this.emitValue(`${this.datePart}T${this.timePart || '00:00'}`);
  }

  onTriggerMouseDown(event: MouseEvent, input: HTMLInputElement): void {
    event.preventDefault();
    event.stopPropagation();
    openNativeInputPicker(input);
    this.onTouched();
  }

  private applyValue(value: string): void {
    if (!value) {
      this.datePart = '';
      this.timePart = '';
      return;
    }
    const [datePart, timePart = ''] = value.split('T');
    this.datePart = datePart;
    this.timePart = timePart.slice(0, 5);
  }

  private emitValue(value: string): void {
    this.onChange(value);
    this.onTouched();
  }
}
