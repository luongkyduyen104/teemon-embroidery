import { supabase } from "./supabase.js";

export const activityActions = Object.freeze({
  CREATE_PRODUCT: "CREATE_PRODUCT",
  UPDATE_PRODUCT: "UPDATE_PRODUCT",
  PUBLISH_PRODUCT: "PUBLISH_PRODUCT",
  UNPUBLISH_PRODUCT: "UNPUBLISH_PRODUCT",
  UPDATE_VARIANT: "UPDATE_VARIANT",
  UPDATE_STOCK: "UPDATE_STOCK",
});

export async function recordActivity({
  action,
  entityType,
  entityId,
  before = null,
  after = null,
  metadata = {},
}) {
  const { data, error } = await supabase.rpc("record_activity", {
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: String(entityId || ""),
    p_before_data: before,
    p_after_data: after,
    p_metadata: metadata,
  });

  if (error) throw new Error(`Activity log failed: ${error.message}`);
  return data;
}

