const FORM_TYPES = [
  'sponsorship',
  'partnership',
  'guest_suggestion',
  'careers',
  'production_service',
  'guest_review',
];

export const EMAIL_ENVIRONMENT_POLICIES = {
  development: {
    appEnvironment: 'production',
    deploymentPlatform: 'cloudflare-workers',
    senderDomain: 'devmail.mukhtalif.net',
    recipients: Object.fromEntries(FORM_TYPES.map((type) => [type, ['aaahashmi95@gmail.com']])),
  },
  production: {
    appEnvironment: 'production',
    deploymentPlatform: 'hostinger',
    senderDomain: 'notify.mukhtalif.net',
    recipients: {
      sponsorship: ['bd@mukhtalif.net'],
      partnership: ['bd@mukhtalif.net'],
      guest_suggestion: ['pr@mukhtalif.net'],
      careers: ['hr@mukhtalif.net'],
      production_service: ['bd@mukhtalif.net'],
      guest_review: ['pr@mukhtalif.net'],
    },
  },
};

function normalizedRouting(input) {
  let parsed;
  try {
    parsed = JSON.parse(input ?? '');
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return Object.fromEntries(
    Object.entries(parsed).map(([type, recipients]) => [
      type,
      Array.isArray(recipients)
        ? [...new Set(recipients.map((recipient) => String(recipient).trim().toLowerCase()))]
        : recipients,
    ]),
  );
}

/** Returns problem labels only. It never returns or logs secret values. */
export function validateEmailEnvironment(env, expectedEnvironment, { requireApiKey = true } = {}) {
  const policy = EMAIL_ENVIRONMENT_POLICIES[expectedEnvironment];
  if (!policy) return ['unknown expected email environment'];

  const problems = [];
  if (env.APP_ENV !== policy.appEnvironment) problems.push('APP_ENV');
  if (env.DEPLOYMENT_PLATFORM !== policy.deploymentPlatform) {
    problems.push('DEPLOYMENT_PLATFORM');
  }
  if (env.RESEND_ENVIRONMENT !== expectedEnvironment) problems.push('RESEND_ENVIRONMENT');

  const sender = String(env.FORMS_FROM_EMAIL ?? '')
    .trim()
    .toLowerCase();
  if (sender.slice(sender.lastIndexOf('@') + 1) !== policy.senderDomain) {
    problems.push('FORMS_FROM_EMAIL');
  }

  const routing = normalizedRouting(env.FORM_NOTIFICATION_RECIPIENTS_JSON);
  const routingMatches =
    routing &&
    Object.keys(routing).length === FORM_TYPES.length &&
    FORM_TYPES.every(
      (type) => JSON.stringify(routing[type]) === JSON.stringify(policy.recipients[type]),
    );
  if (!routingMatches) {
    problems.push('FORM_NOTIFICATION_RECIPIENTS_JSON');
  }

  if (requireApiKey) {
    const apiKey = String(env.RESEND_API_KEY ?? '');
    if (apiKey.length < 12 || apiKey.length > 512 || !/^[\x21-\x7E]+$/.test(apiKey)) {
      problems.push('RESEND_API_KEY');
    }
  }
  return problems;
}
