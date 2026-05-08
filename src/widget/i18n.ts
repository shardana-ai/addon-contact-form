// Built-in translations for the form. Customers can override individual
// strings via `data-label-<field>` / `data-message-success` etc. attributes
// — see widget/render.ts.

export type SupportedLocale = "it" | "en" | "de" | "fr" | "es";

export interface Translations {
  labels: { name: string; email: string; phone: string; message: string };
  placeholders: { name: string; email: string; phone: string; message: string };
  submit: string;
  submitting: string;
  success: string;
  error: string;
  required: string;
  invalidEmail: string;
  /** Default text on the modal-mode trigger button. */
  triggerLabel: string;
  /** Title rendered in the modal header. */
  modalTitle: string;
  /** Aria-label / tooltip on the modal close button. */
  closeLabel: string;
  /** Aria-label prefix for the phone shortcut button (e.g. "Call"). */
  callLabel: string;
}

const it: Translations = {
  labels: { name: "Nome", email: "Email", phone: "Telefono", message: "Messaggio" },
  placeholders: {
    name: "Mario Rossi",
    email: "tu@example.com",
    phone: "+39 333 1234567",
    message: "Scrivici qualcosa…",
  },
  submit: "Invia",
  submitting: "Invio in corso…",
  success: "Grazie! Ti risponderemo al più presto.",
  error: "Si è verificato un errore. Riprova fra qualche istante.",
  required: "Campo obbligatorio",
  invalidEmail: "Email non valida",
  triggerLabel: "Contattaci",
  modalTitle: "Scrivici un messaggio",
  closeLabel: "Chiudi",
  callLabel: "Chiama",
};

const en: Translations = {
  labels: { name: "Name", email: "Email", phone: "Phone", message: "Message" },
  placeholders: { name: "Jane Doe", email: "you@example.com", phone: "+1 555 1234", message: "Tell us something…" },
  submit: "Send",
  submitting: "Sending…",
  success: "Thanks! We will get back to you shortly.",
  error: "Something went wrong. Please try again in a moment.",
  required: "Required field",
  invalidEmail: "Invalid email address",
  triggerLabel: "Contact us",
  modalTitle: "Write us a message",
  closeLabel: "Close",
  callLabel: "Call",
};

const de: Translations = {
  labels: { name: "Name", email: "E-Mail", phone: "Telefon", message: "Nachricht" },
  placeholders: { name: "Max Mustermann", email: "du@example.com", phone: "+49 30 1234567", message: "Schreib uns…" },
  submit: "Senden",
  submitting: "Wird gesendet…",
  success: "Danke! Wir melden uns in Kürze.",
  error: "Etwas ist schiefgelaufen. Bitte erneut versuchen.",
  required: "Pflichtfeld",
  invalidEmail: "Ungültige E-Mail",
  triggerLabel: "Kontaktiere uns",
  modalTitle: "Schreib uns eine Nachricht",
  closeLabel: "Schließen",
  callLabel: "Anrufen",
};

const fr: Translations = {
  labels: { name: "Nom", email: "Email", phone: "Téléphone", message: "Message" },
  placeholders: { name: "Jean Dupont", email: "vous@example.com", phone: "+33 1 23 45 67 89", message: "Écrivez-nous…" },
  submit: "Envoyer",
  submitting: "Envoi en cours…",
  success: "Merci ! Nous reviendrons vers vous rapidement.",
  error: "Une erreur s'est produite. Veuillez réessayer.",
  required: "Champ obligatoire",
  invalidEmail: "Email invalide",
  triggerLabel: "Contactez-nous",
  modalTitle: "Écrivez-nous un message",
  closeLabel: "Fermer",
  callLabel: "Appeler",
};

const es: Translations = {
  labels: { name: "Nombre", email: "Email", phone: "Teléfono", message: "Mensaje" },
  placeholders: { name: "Juan Pérez", email: "tu@example.com", phone: "+34 600 123 456", message: "Cuéntanos algo…" },
  submit: "Enviar",
  submitting: "Enviando…",
  success: "¡Gracias! Te responderemos en breve.",
  error: "Algo salió mal. Vuelve a intentarlo en un momento.",
  required: "Campo obligatorio",
  invalidEmail: "Email no válido",
  triggerLabel: "Contáctanos",
  modalTitle: "Escríbenos un mensaje",
  closeLabel: "Cerrar",
  callLabel: "Llamar",
};

const TABLE: Record<SupportedLocale, Translations> = { it, en, de, fr, es };

export function getTranslations(locale: string | undefined): Translations {
  if (!locale) return TABLE.it;
  const key = locale.slice(0, 2).toLowerCase() as SupportedLocale;
  return TABLE[key] ?? TABLE.it;
}
