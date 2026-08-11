import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/auth";

export function SignOutButton() {
  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <form action={handleSignOut}>
      <Button type="submit" variant="ghost" size="icon" aria-label="Sair">
        <LogOut className="size-4" />
      </Button>
    </form>
  );
}
