import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SUPABASE_URL = "https://xtwzhsftzhidhzdvmkaf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_C7Ah5kcDdY7KuxJ_rkgktg_C9QPG_P0";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);