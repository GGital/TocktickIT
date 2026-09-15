/** The signed-in Requester every Lab 2 screen test runs as, returned by GET /api/auth/me (api-spec §2.1). */
export const signedInRequester = {
  id: 1,
  fullName: 'Nadia Charoen',
  email: 'nadia@toktickit.test',
  role: 'REQUESTER',
  mustChangePassword: false,
} as const

export const isAuthMe = (url: string) => url === '/api/auth/me'
