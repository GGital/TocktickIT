import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

// findBy*/waitFor give up after 1 s by default, which a full parallel run can exceed on a busy machine.
configure({ asyncUtilTimeout: 5000 })

// jsdom ships <dialog> without modality: showModal/close are missing. ConfirmDialog
// uses the native API (focus trap, Esc, backdrop) so browsers and Playwright get it
// for free; this minimal stand-in keeps that component testable under jsdom.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
}
