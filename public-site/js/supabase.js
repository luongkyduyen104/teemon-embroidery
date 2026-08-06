import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://eppixfkfvxmjdyudzxja.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_X1t2-Y_fpZnA2x8nWcD8Vg_9OJ7twEs";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);