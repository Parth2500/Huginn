/** The signed-in user's token. Moves to an httpOnly cookie session in milestone 0.5. */
export const getAccessToken = (): string | null => localStorage.getItem('access_token');
