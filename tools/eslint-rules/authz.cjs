"use strict";

// Recognizes the four legitimate ways a mutating handler can be authorized, so each no
// longer needs a hand-written // authz-exempt comment:
//   1. au.checkAccess(...) permission gate
//   2. anonymous (actionWrapperAnon) — no `au` to gate on; the wrapper itself is the marker
//   3. ownership scoping — compares/assigns au.personId or au.id (self-service)
//   4. delegated gate — a *Auth.x(...) or can*(...) helper
// ponytail: regex heuristics, not a call graph — a handler could mimic a pattern without truly
// scoping; periodically `grep actionWrapperAnon` to review the anon surface. authz-exempt still
// suppresses the rare genuine edge case (e.g. a churchId-scoped proxy open to any member).

const MUTATING_DECORATORS = new Set(["httpPost", "httpPut", "httpPatch", "httpDelete"]);

function hasMutatingDecorator(node) {
  if (!node.decorators || node.decorators.length === 0) return false;
  return node.decorators.some((dec) => {
    const expr = dec.expression;
    if (!expr) return false;
    // @httpPost("...") → CallExpression whose callee is Identifier
    if (expr.type === "CallExpression" && expr.callee && expr.callee.type === "Identifier") {
      return MUTATING_DECORATORS.has(expr.callee.name);
    }
    return false;
  });
}

function hasAuthzExemptComment(comments, methodText) {
  if (comments && comments.some((c) => c.value.includes("authz-exempt"))) return true;
  if (methodText && methodText.includes("authz-exempt")) return true;
  return false;
}

const AUTH_HELPER = /\b\w*Auth\.\w+\s*\(/;      // PlanAuth.canEditPosition(...), FormAuth.x(...)
const AUTH_CAN = /\bcan[A-Z]\w*\s*\(/;          // canResolve(...), canEditPosition(...)
const OWNERSHIP = [
  /\.\w+\s*=\s*au\.(personId|id)\b/,            // row.personId = au.personId (forces ownership on write)
  /\b\w+\s*:\s*au\.(personId|id)\b/,            // { personId: au.personId } (forces ownership in an object literal)
  /\bau\.(personId|id)\s*(===|!==|==|!=)/,      // au.personId === ...
  /(===|!==|==|!=)\s*au\.(personId|id)\b/       // ... !== au.personId
];

function isGated(text) {
  if (text.includes("checkAccess")) return true;
  if (AUTH_HELPER.test(text) || AUTH_CAN.test(text)) return true;
  return OWNERSHIP.some((re) => re.test(text));
}

const requireCheckAccess = {
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      MethodDefinition(node) {
        if (!hasMutatingDecorator(node)) return;

        const src = context.getSourceCode();
        const methodText = src.getText(node);

        // Anonymous handlers have no `au` to gate on; actionWrapperAnon is the explicit marker.
        if (methodText.includes("actionWrapperAnon")) return;

        const commentsBefore = src.getCommentsBefore(node);
        if (hasAuthzExemptComment(commentsBefore, methodText)) return;

        if (!isGated(methodText)) {
          const name = node.key && node.key.name ? node.key.name : "(anonymous)";
          context.report({
            node,
            message: `Mutating route handler '${name}' has no authorization — no checkAccess(), no ownership check (au.personId/au.id), no *Auth/can*() gate. Add one or annotate // authz-exempt: <reason>.`
          });
        }
      }
    };
  }
};

// Returns true if a node is a MemberExpression of the form req.body / req.params / req.query
function isReqSource(node) {
  return (
    node.type === "MemberExpression" &&
    !node.computed &&
    node.object.type === "Identifier" &&
    node.object.name === "req" &&
    node.property.type === "Identifier" &&
    ["body", "params", "query"].includes(node.property.name)
  );
}

function lineHasExempt(src, line) {
  const lines = src.lines || src.getText().split("\n");
  const text = lines[line - 1] || "";
  return text.includes("authz-exempt");
}

function exemptByComment(src, node) {
  const loc = node.loc;
  if (!loc) return false;
  const lines = src.getText().split("\n");
  const lineIdx = loc.start.line - 1;
  const sameLine = lines[lineIdx] || "";
  if (sameLine.includes("authz-exempt")) return true;
  if (lineIdx > 0 && (lines[lineIdx - 1] || "").includes("authz-exempt")) return true;
  return false;
}

const noUntrustedChurchId = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const src = context.getSourceCode();
    return {
      // req.body.churchId / req.params.churchId / req.query.churchId
      MemberExpression(node) {
        if (
          node.type === "MemberExpression" &&
          !node.computed &&
          node.property.type === "Identifier" &&
          node.property.name === "churchId" &&
          isReqSource(node.object)
        ) {
          if (exemptByComment(src, node)) return;
          const source = node.object.property.name; // body | params | query
          context.report({
            node,
            message: `Tenant scoping must use au.churchId (JWT), not req.${source}.churchId (attacker-controlled). Fix or annotate // authz-exempt: <reason>.`
          });
        }
      },
      // const { churchId } = req.body / req.params / req.query
      VariableDeclarator(node) {
        if (
          node.id &&
          node.id.type === "ObjectPattern" &&
          node.init &&
          isReqSource(node.init)
        ) {
          const churchIdProp = node.id.properties.find(
            (p) =>
              p.type === "Property" &&
              p.key &&
              p.key.type === "Identifier" &&
              p.key.name === "churchId"
          );
          if (!churchIdProp) return;
          if (exemptByComment(src, node)) return;
          const source = node.init.property.name;
          context.report({
            node,
            message: `Tenant scoping must use au.churchId (JWT), not req.${source}.churchId (attacker-controlled). Fix or annotate // authz-exempt: <reason>.`
          });
        }
      }
    };
  }
};

module.exports = {
  rules: {
    "require-checkaccess": requireCheckAccess,
    "no-untrusted-churchid": noUntrustedChurchId
  }
};
