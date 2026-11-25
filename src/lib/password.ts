// Regla de contraseñas NUEVAS (registro, recuperación, cambio). Debe coincidir
// con Supabase → Authentication → Email → Password requirements (mínimo 8,
// letras y números). El inicio de sesión no la aplica: las contraseñas viejas
// más cortas siguen funcionando hasta que el usuario las cambie.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_HINT = "Mínimo 8 caracteres, con letras y números";

/** Devuelve el motivo por el que la contraseña no sirve, o null si cumple. */
export function passwordError(pwd: string): string | null {
  if (pwd.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(pwd) || !/[0-9]/.test(pwd)) {
    return "La contraseña debe tener letras y números.";
  }
  return null;
}
