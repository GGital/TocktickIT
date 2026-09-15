import { Link } from 'react-router-dom'
import Callout from './Callout'
import { homeFor } from '../lib/auth'
import { ROLE_LABELS, type Role } from '../lib/roles'

/**
 * The shared 403 presentation (ui-spec §2.5). States the role's limit without naming what the screen holds — no
 * identifier, no title, no count (BR-24) — and offers one way back.
 */
export default function ForbiddenState({ role }: { role: Role }) {
  return (
    <div className="zen-forbidden">
      <Callout variant="warning" title="You do not have access to this page.">
        <p>Your account has the {ROLE_LABELS[role]} role, which cannot open this screen.</p>
        <Link to={homeFor(role)} className="btn btn-primary">
          Go to your home page
        </Link>
      </Callout>
    </div>
  )
}
