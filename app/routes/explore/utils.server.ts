import { Prisma } from "@prisma/client";
import type { Profile } from "@prisma/client";
import type { SupabaseClient, User } from "@supabase/auth-helpers-remix";
import { notFound } from "remix-utils";
import { getImageURL } from "~/images.server";
import { prismaClient } from "~/prisma";
import { getAreaById } from "~/profile.server";
import { getPublicURL } from "~/storage.server";

export async function getAllProfiles(
  options: {
    skip: number | undefined;
    take: number | undefined;
    areaId: string | undefined;
    offerId: string | undefined;
    seekingId: string | undefined;
  } = {
    skip: undefined,
    take: undefined,
    areaId: undefined,
    offerId: undefined,
    seekingId: undefined,
  }
) {
  const { skip, take, areaId, offerId, seekingId } = options;

  let areaToFilter;
  let whereClauses = [];
  let whereClause = Prisma.empty;
  let offerJoin = Prisma.empty;
  let seekingJoin = Prisma.empty;
  // Default ordering: first_name ASC
  let orderByClause = Prisma.sql`ORDER BY "score" DESC, "updatedAt" DESC, "firstName" ASC`;
  if (areaId !== undefined) {
    areaToFilter = await getAreaById(areaId);
    if (areaToFilter !== null) {
      let areaWhere;
      if (areaToFilter.type === "country") {
        /* No WHERE statement needed as we want to select all profiles that have at least one area */
        /* ORDER BY: country -> state -> district */
        orderByClause = Prisma.sql`
                        ORDER BY (
                          CASE 
                            WHEN 'country' = ANY (array_agg(DISTINCT areas.type)) THEN 1 
                            WHEN 'state' = ANY (array_agg(DISTINCT areas.type)) THEN 2 
                            WHEN 'district' = ANY (array_agg(DISTINCT areas.type)) THEN 3 
                            ELSE 4 
                          END
                        ) ASC,
                        "score" DESC,
                        "updatedAt" DESC,
                        "firstName" ASC`;
      }
      if (areaToFilter.type === "state") {
        /* Filter profiles that have the exact state as area or districts inside that state as area or an area of the type country */
        if (areaToFilter.stateId !== null) {
          areaWhere = Prisma.sql`"stateId" = ${areaToFilter.stateId} OR type = 'country'`;
        } else {
          areaWhere = Prisma.sql`areas.id = ${areaToFilter.id} OR type = 'country'`;
        }
        /* ORDER BY: state -> district -> country */
        orderByClause = Prisma.sql`
                        ORDER BY (
                          CASE 
                            WHEN 'state' = ANY (array_agg(DISTINCT areas.type)) THEN 1 
                            WHEN 'district' = ANY (array_agg(DISTINCT areas.type)) THEN 2 
                            WHEN 'country' = ANY (array_agg(DISTINCT areas.type)) THEN 3 
                            ELSE 4 
                          END
                        ) ASC, 
                        "score" DESC,
                        "updatedAt" DESC,
                        "firstName" ASC`;
      }
      if (areaToFilter.type === "district") {
        /* Filter profiles that have the exact district as area or the state where the district is part of or an area of the type country */
        if (areaToFilter.stateId !== null) {
          areaWhere = Prisma.sql`areas.id = ${areaToFilter.id} OR (type = 'state' AND "stateId" = ${areaToFilter.stateId}) OR type = 'country'`;
        } else {
          areaWhere = Prisma.sql`areas.id = ${areaToFilter.id} OR type = 'state' OR type = 'country'`;
        }
        /* ORDER BY: district -> state -> country */
        orderByClause = Prisma.sql`
                        ORDER BY (
                          CASE 
                            WHEN 'district' = ANY (array_agg(DISTINCT areas.type)) THEN 1 
                            WHEN 'state' = ANY (array_agg(DISTINCT areas.type)) THEN 2 
                            WHEN 'country' = ANY (array_agg(DISTINCT areas.type)) THEN 3 
                            ELSE 4 
                          END
                        ) ASC, 
                        "score" DESC,
                        "updatedAt" DESC,
                        "firstName" ASC`;
      }
      if (areaWhere !== undefined) {
        whereClauses.push(areaWhere);
      }
    } else {
      throw notFound({ message: "Area to filter not found" });
    }
  }
  if (offerId !== undefined) {
    offerJoin = Prisma.sql`
                LEFT JOIN offers_on_profiles
                ON profiles.id = offers_on_profiles."profileId"
                LEFT JOIN offer O
                ON offers_on_profiles."offerId" = O.id`;
    /* Filter profiles that have the exact offer */
    const offerWhere = Prisma.sql`O.id = ${offerId}`;
    whereClauses.push(offerWhere);
  }
  if (seekingId !== undefined) {
    seekingJoin = Prisma.sql`
                  LEFT JOIN seekings_on_profiles
                  ON profiles.id = seekings_on_profiles."profileId"
                  LEFT JOIN offer S
                  ON seekings_on_profiles."offerId" = S.id`;
    /* Filter profiles that have the exact seeking */
    const seekingWhere = Prisma.sql`S.id = ${seekingId}`;
    whereClauses.push(seekingWhere);
  }
  if (whereClauses.length > 0) {
    /* All WHERE clauses must hold true and are therefore connected with an logical AND */
    whereClause = Prisma.join(whereClauses, ") AND (", "WHERE (", ")");
  }

  const profiles: Array<
    Pick<
      Profile,
      | "id"
      | "publicFields"
      | "academicTitle"
      | "firstName"
      | "lastName"
      | "username"
      | "bio"
      | "avatar"
      | "position"
      | "score"
      | "updatedAt"
    > & { areaNames: string[] }
  > = await prismaClient.$queryRaw`
    SELECT 
      profiles.id,
      profiles.public_fields as "publicFields",
      profiles.first_name as "firstName",
      profiles.last_name as "lastName",
      profiles.username, profiles.academic_title as "academicTitle",
      profiles.position,
      profiles.bio,
      profiles.avatar,
      profiles.score,
      profiles.updated_at as "updatedAt",
      array_remove(array_agg(DISTINCT areas.name), null) as "areaNames"
    FROM profiles
      /* Always joining areas to get areaNames */
      LEFT JOIN areas_on_profiles
      ON profiles.id = areas_on_profiles."profileId"
      LEFT JOIN areas
      ON areas_on_profiles."areaId" = areas.id
      ${offerJoin}
      ${seekingJoin}
    /* Filtering with the where clauses from above if any exist */
    ${whereClause || Prisma.empty}
    GROUP BY profiles.id
    ${orderByClause}
    LIMIT ${take}
    OFFSET ${skip}
  ;`;

  return profiles;
}

export async function getAllOrganizations(
  skip: number | undefined = undefined,
  take: number | undefined = undefined
) {
  const organizations = await prismaClient.organization.findMany({
    skip,
    take,
    include: {
      areas: { select: { area: { select: { name: true } } } },
      focuses: { select: { focus: { select: { title: true } } } },
      types: { select: { organizationType: { select: { title: true } } } },
    },
    orderBy: [{ score: "desc" }, { updatedAt: "asc" }],
  });

  return organizations;
}

export async function getAllProjects(
  skip: number | undefined = undefined,
  take: number | undefined = undefined
) {
  const projects = await prismaClient.project.findMany({
    skip,
    take,
    select: {
      id: true,
      slug: true,
      name: true,
      logo: true,
      background: true,
      excerpt: true,
      awards: {
        select: {
          award: {
            select: {
              id: true,
              title: true,
              shortTitle: true,
              date: true,
              logo: true,
            },
          },
        },
      },
      responsibleOrganizations: {
        select: {
          organization: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  return projects;
}

export function getPaginationValues(
  request: Request,
  options = { itemsPerPage: 6 }
) {
  const url = new URL(request.url);
  const pageParam = url.searchParams.get("page") || "1";

  let page = parseInt(pageParam);
  if (Number.isNaN(page) || page < 1) {
    page = 1;
  }

  const skip = options.itemsPerPage * (page - 1);
  const take = options.itemsPerPage;

  return { skip, take };
}

export function getFilterValues(request: Request) {
  const url = new URL(request.url);
  const areaId = url.searchParams.get("areaId") || undefined;
  const offerId = url.searchParams.get("offerId") || undefined;
  const seekingId = url.searchParams.get("seekingId") || undefined;
  return { areaId, offerId, seekingId };
}

export async function getEvents(
  inFuture: boolean,
  skip: number | undefined = undefined,
  take: number | undefined = undefined
) {
  const result = await prismaClient.event.findMany({
    where: {
      endTime: inFuture
        ? {
            gte: new Date(),
          }
        : { lte: new Date() },
      published: true,
    },
    skip,
    take,
    select: {
      id: true,
      name: true,
      slug: true,
      parentEventId: true,
      startTime: true,
      endTime: true,
      participationUntil: true,
      participationFrom: true,
      participantLimit: true,
      background: true,
      published: true,
      stage: {
        select: {
          title: true,
        },
      },
      canceled: true,
      subline: true,
      description: true,
      _count: {
        select: {
          childEvents: true,
          participants: true,
          responsibleOrganizations: true,
          waitingList: true,
        },
      },
      responsibleOrganizations: {
        select: {
          organization: {
            select: {
              name: true,
              slug: true,
              logo: true,
            },
          },
        },
      },
    },
    orderBy: inFuture
      ? {
          startTime: "asc",
        }
      : { startTime: "desc" },
  });
  return result;
}

export type MaybeEnhancedEvents =
  | Awaited<ReturnType<typeof getEvents>>
  | Awaited<ReturnType<typeof enhanceEventsWithParticipationStatus>>;

export async function enhanceEventsWithParticipationStatus(
  currentUserId: string,
  events: Awaited<ReturnType<typeof getEvents>>
) {
  const eventIdsWhereParticipant = (
    await prismaClient.participantOfEvent.findMany({
      where: {
        profileId: currentUserId,
      },
      select: {
        eventId: true,
      },
    })
  ).map((event) => event.eventId);
  const eventIdsWhereOnWaitingList = (
    await prismaClient.waitingParticipantOfEvent.findMany({
      where: {
        profileId: currentUserId,
      },
      select: {
        eventId: true,
      },
    })
  ).map((event) => event.eventId);
  const eventIdsWhereSpeaker = (
    await prismaClient.speakerOfEvent.findMany({
      where: {
        profileId: currentUserId,
      },
      select: {
        eventId: true,
      },
    })
  ).map((event) => event.eventId);
  const eventIdsWhereTeamMember = (
    await prismaClient.teamMemberOfEvent.findMany({
      where: {
        profileId: currentUserId,
      },
      select: {
        eventId: true,
      },
    })
  ).map((event) => event.eventId);

  const enhancedEvents = events.map((item) => {
    const isParticipant = eventIdsWhereParticipant.includes(item.id);
    const isOnWaitingList = eventIdsWhereOnWaitingList.includes(item.id);
    const isSpeaker = eventIdsWhereSpeaker.includes(item.id);
    const isTeamMember = eventIdsWhereTeamMember.includes(item.id);

    return {
      ...item,
      isParticipant,
      isOnWaitingList,
      isSpeaker,
      isTeamMember,
    };
  });
  return enhancedEvents;
}

export async function prepareEvents(
  authClient: SupabaseClient,
  sessionUser: User | null,
  inFuture: boolean,
  options: {
    skip: number | undefined;
    take: number | undefined;
  } = { skip: undefined, take: undefined }
) {
  const events = await getEvents(inFuture, options.skip, options.take);

  let enhancedEvents: MaybeEnhancedEvents = events;

  if (sessionUser !== null) {
    enhancedEvents = await enhanceEventsWithParticipationStatus(
      sessionUser.id,
      events
    );
  }

  enhancedEvents = enhancedEvents.map((item) => {
    if (item.background !== null) {
      const publicURL = getPublicURL(authClient, item.background);
      if (publicURL) {
        item.background = getImageURL(publicURL, {
          resize: { type: "fit", width: 400, height: 280 },
        });
      }
    }
    return item;
  });

  enhancedEvents = enhancedEvents.map((event) => {
    if (event.responsibleOrganizations.length > 0) {
      event.responsibleOrganizations = event.responsibleOrganizations.map(
        (item) => {
          if (item.organization.logo !== null) {
            const publicURL = getPublicURL(authClient, item.organization.logo);
            if (publicURL) {
              item.organization.logo = getImageURL(publicURL, {
                resize: { type: "fit", width: 144, height: 144 },
              });
            }
          }
          return item;
        }
      );
    }
    return event;
  });
  return enhancedEvents as MaybeEnhancedEvents;
}
