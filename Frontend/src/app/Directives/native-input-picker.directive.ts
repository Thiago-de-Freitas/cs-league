import { Directive, HostListener } from '@angular/core';
import { openNativeInputPicker } from '../Utils/native-input-picker.util';

@Directive({
  selector: 'input[appNativeInputPicker]',
  standalone: true,
})
export class NativeInputPickerDirective {
  @HostListener('click', ['$event'])
  onClick(event: MouseEvent): void {
    openNativeInputPicker(event.currentTarget as HTMLInputElement);
  }
}
