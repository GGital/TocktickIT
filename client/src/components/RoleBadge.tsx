import Badge from './Badge'
import { ROLE_LABELS, type Role } from '../lib/roles'

const TONES: Record<Role, string> = {
  REQUESTER: 'role-requester',
  IT_STAFF: 'role-it-staff',
  ADMINISTRATOR: 'role-administrator',
}

/** The role badge family (ui-spec §1.2), always labelled with the role name. */
export default function RoleBadge({ role }: { role: Role }) {
  return <Badge tone={TONES[role]}>{ROLE_LABELS[role]}</Badge>
}
