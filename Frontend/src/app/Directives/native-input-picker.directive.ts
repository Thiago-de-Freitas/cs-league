import { Directive, HostListener } from '@angular/core';
import { openNativeInputPicker } from '../Utils/native-input-picker.util';

@Directive({
  selector: 'input[appNativeInputPicker]',
  standalone: true,
})
export class NativeInputPickerDirective {
  @HostListener('click', ['$event'])
  onClick(event: MouseEvent): void {
    const input = event.currentTarget as HTMLInputElement;
    if ((event.target as HTMLElement).closest('.gc-native-datetime-trigger')) return;
    openNativeInputPicker(input);
  }
}
