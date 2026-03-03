export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export function pageview(url: string) {
  if (!GA_MEASUREMENT_ID) return;
  window.gtag('config', GA_MEASUREMENT_ID, { page_path: url });
}

export function event(action: string, params?: Record<string, string | number | boolean>) {
  if (!GA_MEASUREMENT_ID) return;
  window.gtag('event', action, params);
}

export const analytics = {
  // Registration funnel
  registrationStarted: (eventId: string, eventName: string) =>
    event('registration_started', { event_id: eventId, event_name: eventName }),
  registrationStepViewed: (step: string, eventId: string) =>
    event('registration_step_viewed', { step, event_id: eventId }),
  registrationCompleted: (eventId: string, type: string, amount: number) =>
    event('registration_completed', { event_id: eventId, participant_type: type, amount }),
  registrationError: (eventId: string, error: string) =>
    event('registration_error', { event_id: eventId, error_message: error }),

  // Check-in
  checkinCompleted: (eventId: string, type: string) =>
    event('checkin_completed', { event_id: eventId, participant_type: type }),

  // Payments
  paymentStarted: (method: string, amount: number) =>
    event('payment_started', { method, amount }),
  paymentCompleted: (method: string, amount: number, txnId: string) =>
    event('payment_completed', { method, amount, transaction_id: txnId }),
  paymentFailed: (method: string, error: string) =>
    event('payment_failed', { method, error_message: error }),

  // Member portal
  portalViewed: () => event('portal_viewed'),
  profileUpdated: (section: string) => event('profile_updated', { section }),
  membershipRenewalClicked: () => event('membership_renewal_clicked'),

  // Admin CRUD
  recordCreated: (entityType: string) => event('record_created', { entity_type: entityType }),
  recordUpdated: (entityType: string) => event('record_updated', { entity_type: entityType }),
  recordDeleted: (entityType: string) => event('record_deleted', { entity_type: entityType }),

  // Reports
  reportExported: (reportType: string, format: string) =>
    event('report_exported', { report_type: reportType, format }),

  // Events management
  eventCreated: (eventName: string) => event('event_created', { event_name: eventName }),
  eventRegistrationToggled: (eventId: string, open: boolean) =>
    event('event_registration_toggled', { event_id: eventId, registration_open: open }),

  // Auth
  loginSuccess: (role: string) => event('login_success', { user_role: role }),
  logout: () => event('logout'),
};
