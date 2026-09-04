/**
 * Reusable request validation middleware built on Zod.
 *
 * Why this over hand-rolled `if (!field) return res.status(400)...` checks
 * scattered through every route: those checks (still present throughout
 * this codebase) only ever catch "missing", never "wrong shape" — a
 * `sex: "MALE"` (wrong case), a `dateOfBirth: "not-a-date"`, or a
 * `quantity: -50` currently sails straight through to Mongoose, which
 * either silently coerces it wrong or throws a raw ValidationError with an
 * internal Mongoose error shape leaking to the client. A schema-based layer
 * catches all of that at the door, with one consistent 400 response shape.
 *
 * Usage:
 *   const { validate } = require('../middleware/validate');
 *   const { z } = require('zod');
 *   router.post('/', validate({ body: mySchema }), handler);
 *
 * Deliberately validates req.body / req.query / req.params independently
 * (only the parts you pass a schema for) rather than forcing one combined
 * schema — most routes here only need to validate the body.
 */
function validate({ body, query, params } = {}) {
  return (req, res, next) => {
    const errors = [];

    if (body) {
      const result = body.safeParse(req.body);
      if (!result.success) {
        errors.push(...formatZodErrors(result.error, 'body'));
      } else {
        req.body = result.data; // use the parsed/coerced/defaulted value onward
      }
    }

    if (query) {
      const result = query.safeParse(req.query);
      if (!result.success) {
        errors.push(...formatZodErrors(result.error, 'query'));
      } else {
        req.query = result.data;
      }
    }

    if (params) {
      const result = params.safeParse(req.params);
      if (!result.success) {
        errors.push(...formatZodErrors(result.error, 'params'));
      } else {
        req.params = result.data;
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    next();
  };
}

function formatZodErrors(zodError, location) {
  return zodError.issues.map((issue) => ({
    location,
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

module.exports = { validate };
