import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { getSessionAndGmailClient } from "@/utils/actions/helpers";
import { getSenders } from "@inboxzero/tinybird";
import prisma from "@/utils/prisma";
import { isActionError } from "@/utils/error";

export type UncategorizedSendersResponse = {
  uncategorizedSenders: string[];
  nextOffset?: number;
};

async function getUncategorizedSenders({
  email,
  userId,
  offset = 0,
  limit = 100,
}: {
  email: string;
  userId: string;
  offset?: number;
  limit?: number;
}) {
  let uncategorizedSenders: string[] = [];
  let currentOffset = offset;

  while (uncategorizedSenders.length === 0) {
    const result = await getSenders({
      ownerEmail: email,
      limit,
      offset: currentOffset,
    });
    const allSenders = result.data.map((sender) => sender.from);

    const existingSenders = await prisma.newsletter.findMany({
      where: {
        email: { in: allSenders },
        userId,
        category: { isNot: null },
      },
      select: { email: true },
    });

    const existingSenderEmails = new Set(existingSenders.map((s) => s.email));

    uncategorizedSenders = allSenders.filter(
      (email) => !existingSenderEmails.has(email),
    );

    // Break the loop if no more senders are available
    if (allSenders.length < limit) {
      return { uncategorizedSenders };
    }

    currentOffset += limit;
  }

  return {
    uncategorizedSenders,
    nextOffset: currentOffset, // Only return nextOffset if there might be more
  };
}

export const GET = withError(async (request: Request) => {
  const sessionResult = await getSessionAndGmailClient();
  if (isActionError(sessionResult))
    return NextResponse.json({ error: sessionResult.error });
  const { user } = sessionResult;

  const url = new URL(request.url);
  const offset = Number.parseInt(url.searchParams.get("offset") || "0");

  const result = await getUncategorizedSenders({
    email: user.email,
    userId: user.id,
    offset,
  });

  return NextResponse.json(result);
});
