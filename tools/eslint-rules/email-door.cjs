"use strict";

// Phase 3 of the notifications unification: direct email exists ONLY behind the
// transactional wrapper or the funnel itself. Everything else must call
// NotificationService/NotificationHelper.createNotifications (options.emailImmediate)
// or TransactionalEmailHelper.sendTransactional().

const ALLOWED_FILES = [
  "src/modules/messaging/helpers/NotificationHelper.ts",
  "src/shared/helpers/TransactionalEmailHelper.ts"
];

function isAllowedFile(filename) {
  const normalized = filename.replace(/\\/g, "/");
  return ALLOWED_FILES.some((allowed) => normalized.endsWith(allowed));
}

const noDirectEmailHelper = {
  meta: { type: "problem", schema: [] },
  create(context) {
    if (isAllowedFile(context.getFilename())) return {};
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.object.type === "Identifier" &&
          callee.object.name === "EmailHelper" &&
          callee.property.type === "Identifier" &&
          (callee.property.name === "sendTemplatedEmail" || callee.property.name === "sendEmail")
        ) {
          context.report({
            node,
            message: `Direct EmailHelper.${callee.property.name}() is only allowed inside NotificationHelper.ts (the funnel) and TransactionalEmailHelper.ts. Route this email through the notification funnel (NotificationService.createNotifications with emailImmediate) or TransactionalEmailHelper.sendTransactional().`
          });
        }
      }
    };
  }
};

module.exports = {
  rules: {
    "no-direct-email-helper": noDirectEmailHelper
  }
};
