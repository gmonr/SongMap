import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SongImporter } from "@/components/import/SongImporter";

export const metadata = { title: "Import song · SongMap" };

// The UG server actions invoked from this page may wait out a slow scraping
// proxy (see lib/ug/fetch.ts); the default serverless budget is too tight.
export const maxDuration = 60;

export default async function ImportSongPage() {
  let canSave = false;
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    canSave = true;
  }

  return (
    <div className="space-y-4">
      {!canSave && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Demo mode.</strong> You can paste and preview, but saving
          needs Supabase configured (see the README).
        </div>
      )}
      <div>
        <h1 className="text-xl font-bold">Import a song</h1>
        <p className="mt-1 text-sm text-slate-500">
          Search Ultimate Guitar and pick a result, or paste a chord sheet —
          chords over lyrics (Ultimate Guitar style) or ChordPro. Sections,
          chords, and lyrics are prefilled; bar counts are a first guess for
          you to correct in the editor.
        </p>
      </div>
      <SongImporter canSave={canSave} />
    </div>
  );
}
