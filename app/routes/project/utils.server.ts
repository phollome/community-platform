import type { User } from "@supabase/supabase-js";
import { unauthorized } from "remix-utils";
import { prismaClient } from "~/prisma";

export async function checkIdentityOrThrow(
  request: Request,
  sessionUser: User
) {
  const clonedRequest = request.clone();
  const formData = await clonedRequest.formData();
  const formSenderId = formData.get("userId");

  if (formSenderId === null || formSenderId !== sessionUser.id) {
    throw unauthorized({ message: "Identity check failed" });
  }
}

export async function createProjectOnProfile(
  profileId: string,
  projectName: string,
  projectSlug: string
) {
  const profile = await prismaClient.profile.update({
    where: {
      id: profileId,
    },
    data: {
      teamMemberOfProjects: {
        create: {
          isPrivileged: true,
          project: {
            create: {
              name: projectName,
              slug: projectSlug,
            },
          },
        },
      },
      updatedAt: new Date(),
    },
  });
  return profile;
}
