const User = require("../models/User");

/**
 * Resolve workspace fields to store on the session / return to the client.
 * Safe for any role; returns nulls when not applicable.
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

  return {
    workspaceId: workspaceId || null,
    createdByHodId: createdByHodId != null ? Number(createdByHodId) : null,
  };
}

module.exports = { resolveWorkspaceSessionFields };
