const User = require("../models/User");

/**
 * Resolve workspace + Academic Context fields for session / client payload.
 * Never trust client-supplied context ids.
 */
async function resolveWorkspaceSessionFields(userRow) {
  const role = userRow.role_name ?? userRow.rolename ?? userRow.role ?? null;
  const userId = userRow.id;
  const createdByHodId =
    userRow.created_by_hod_id ?? userRow.createdbyhodid ?? null;

  const workspaceId = await User.getWorkspacePublicUuid({
    id: userId,
    role,
    created_by_hod_id: createdByHodId,
  });

  let academicContextId = null;
  let academicContext = null;
  try {
    const AcademicContextService = require("../services/academicContextService");
    const ctx = await AcademicContextService.getForUser(userId);
    if (ctx) {
      academicContextId = ctx.id;
      academicContext = {
        uuid: ctx.uuid,
        label: ctx.label,
        department: ctx.department,
        academicYear: ctx.academicYear,
        batch: ctx.batch,
        semester: ctx.semester,
        hodName: ctx.hodName,
      };
    }
  } catch {
    /* schema may not exist yet */
  }

  return {
    workspaceId: workspaceId || null,
    createdByHodId: createdByHodId != null ? Number(createdByHodId) : null,
    academicContextId,
    academicContext,
  };
}

module.exports = { resolveWorkspaceSessionFields };
