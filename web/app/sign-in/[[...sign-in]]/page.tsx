import { redirect } from "next/navigation";

/** Native FixMyIron login — not Clerk hosted Account Portal. */
export default function SignInPage() {
  redirect("https://www.fixmyiron.com/login");
}
