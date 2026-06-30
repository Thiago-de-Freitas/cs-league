import { openNativeInputPicker } from './native-input-picker.util';

describe('openNativeInputPicker', () => {
  it('chama showPicker quando disponível', () => {
    const input = document.createElement('input');
    input.type = 'date';
    const showPicker = jasmine.createSpy('showPicker');
    const focusSpy = spyOn(input, 'focus');
    input.showPicker = showPicker;

    openNativeInputPicker(input);

    expect(focusSpy).toHaveBeenCalled();
    expect(showPicker).toHaveBeenCalled();
  });

  it('ignora input desabilitado', () => {
    const input = document.createElement('input');
    input.disabled = true;
    const showPicker = jasmine.createSpy('showPicker');
    input.showPicker = showPicker;

    openNativeInputPicker(input);

    expect(showPicker).not.toHaveBeenCalled();
  });
});
