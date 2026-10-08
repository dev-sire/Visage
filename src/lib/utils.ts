import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { appwriteConfig } from "@/lib/appwrite/config";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// export const convertFileToUrl = (file: File) => URL.createObjectURL(file);

export function formatDateString(dateString: string) {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  };

  const date = new Date(dateString);
  const formattedDate = date.toLocaleDateString("en-US", options);

  // const time = date.toLocaleTimeString([], {
  //   hour: "numeric",
  //   minute: "2-digit",
  // });

  return formattedDate;
}

// 
export const multiFormatDateString = (timestamp: string = ""): string => {
  const timestampNum = Math.round(new Date(timestamp).getTime() / 1000);
  const date: Date = new Date(timestampNum * 1000);
  const now: Date = new Date();

  const diff: number = now.getTime() - date.getTime();
  const diffInSeconds: number = diff / 1000;
  const diffInMinutes: number = diffInSeconds / 60;
  const diffInHours: number = diffInMinutes / 60;
  const diffInDays: number = diffInHours / 24;

  switch (true) {
    case Math.floor(diffInDays) >= 30:
      return formatDateString(timestamp);
    case Math.floor(diffInDays) === 1:
      return `${Math.floor(diffInDays)} day ago`;
    case Math.floor(diffInDays) > 1 && diffInDays < 30:
      return `${Math.floor(diffInDays)} days ago`;
    case Math.floor(diffInHours) >= 1:
      return `${Math.floor(diffInHours)} hours ago`;
    case Math.floor(diffInMinutes) >= 1:
      return `${Math.floor(diffInMinutes)} minutes ago`;
    default:
      return "Just now";
  }
};

export const checkIsLiked = (likeList: string[], userId: string) => {
  return likeList.includes(userId);
};

/**
 * Normalises an image URL that was stored in the database.
 *
 * Older posts saved `.../files/<id>/preview?width=...&quality=...` on the old
 * global `cloud.appwrite.io` host. Appwrite blocks image transformations
 * (everything under /preview) on plans that don't include them, so serve the
 * file itself via /view, and point the host at the project's own endpoint.
 * Anything that isn't an Appwrite URL (blob:, data:, /assets/..., external) is
 * returned unchanged.
 */
export function resolveImageUrl(url?: string | null): string {
  if (!url) return "";

  try {
    const parsed = new URL(url);
    const endpoint = new URL(appwriteConfig.url);

    const isAppwrite =
      parsed.hostname.endsWith("appwrite.io") || parsed.host === endpoint.host;
    if (!isAppwrite) return url;

    if (/\/storage\/buckets\/[^/]+\/files\/[^/]+\/preview$/.test(parsed.pathname)) {
      parsed.pathname = parsed.pathname.replace(/\/preview$/, "/view");
      const project = parsed.searchParams.get("project");
      parsed.search = project ? `?project=${project}` : "";
    }

    parsed.protocol = endpoint.protocol;
    parsed.host = endpoint.host;
    return parsed.toString();
  } catch {
    return url; // relative path or otherwise not a URL
  }
}
