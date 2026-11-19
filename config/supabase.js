
import "react-native-url-polyfill/auto";

import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SUPABASE_URL =
  "https://xtwzhsftzhidhzdvmkaf.supabase.co";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0d3poc2Z0emhpZGh6ZHZta2FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQwMzMyMTAsImV4cCI6MjEwOTYwOTIxMH0.2psxKurzGZCu2mXTZB5uyXn0Rv7efb9m3TyOrFkSExw";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      storage: AsyncStorage,

      // SESSION SETTINGS
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,

      // PASSWORD RECOVERY AUTHENTICATION
      flowType: "pkce",
    },
  }
);
