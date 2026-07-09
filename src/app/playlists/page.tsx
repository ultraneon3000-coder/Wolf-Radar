import { ListIcon } from "@/components/icons";

export default function PlaylistsPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center sm:px-6">
      <ListIcon className="h-8 w-8 text-muted" />
      <h1 className="text-xl font-bold tracking-tight text-ink">Playlists</h1>
      <p className="text-sm text-muted">Kommt bald.</p>
    </main>
  );
}
