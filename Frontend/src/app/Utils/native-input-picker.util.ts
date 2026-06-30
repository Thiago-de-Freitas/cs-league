/** Abre o seletor nativo de data/hora (funciona melhor em modais que o clique no ícone). */
export function openNativeInputPicker(input: HTMLInputElement | null | undefined): void {
  if (!input || input.disabled) return;

  if (typeof input.showPicker === 'function') {
    try {
      input.showPicker();
      return;
    } catch {
      // showPicker pode falhar se não for gesto do usuário ou já estiver aberto
    }
  }

  input.focus();
  input.click();
}
