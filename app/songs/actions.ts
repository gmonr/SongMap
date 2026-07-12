"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { emptySongData } from "@/lib/song/types";

export async function createSong() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("songs")
    .insert({
      title: "Untitled song",
      key: "C",
      time_signature: "4/4",
      data: emptySongData(),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not create song");
  }

  redirect(`/songs/${data.id}/edit`);
}

export async function deleteSong(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("songs").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/songs");
  redirect("/songs");
}
