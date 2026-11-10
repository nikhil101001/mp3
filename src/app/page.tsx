import { redirect } from "next/navigation";

// Until the real library screen exists, the app opens on the iPhone test page.
export default function Home() {
  redirect("/spike");
}
