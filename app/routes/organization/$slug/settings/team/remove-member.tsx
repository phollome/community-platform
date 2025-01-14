import type { ActionFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { makeDomainFunction } from "remix-domains";
import type { PerformMutation } from "remix-forms";
import { performMutation } from "remix-forms";
import type { Schema } from "zod";
import { z } from "zod";
import { createAuthClient, getSessionUserOrThrow } from "~/auth.server";
import { getParamValueOrThrow } from "~/lib/utils/routes";
import {
  checkIdentityOrThrow,
  checkSameOrganizationOrThrow,
} from "../../utils.server";
import {
  disconnectProfileFromOrganization,
  getMembers,
  handleAuthorization,
} from "../utils.server";

const schema = z.object({
  userId: z.string().uuid(),
  teamMemberId: z.string().uuid(),
  organizationId: z.string().uuid(),
});

export const removeMemberSchema = schema;

const mutation = makeDomainFunction(schema)(async (values) => {
  const { teamMemberId, organizationId } = values;
  const members = await getMembers(organizationId);

  // Prevent self deletion
  const privilegedMembersWithoutToRemove = members.filter((member) => {
    return member.isPrivileged && member.profileId !== teamMemberId;
  });

  if (privilegedMembersWithoutToRemove.length > 0) {
    await disconnectProfileFromOrganization(teamMemberId, organizationId);
  } else {
    throw "Unable to remove member - last privileged member.";
  }

  return values;
});

export type ActionData = PerformMutation<
  z.infer<Schema>,
  z.infer<typeof schema>
>;

export const action: ActionFunction = async (args) => {
  const { request, params } = args;
  const response = new Response();

  const authClient = createAuthClient(request, response);

  const sessionUser = await getSessionUserOrThrow(authClient);
  await checkIdentityOrThrow(request, sessionUser);
  const slug = getParamValueOrThrow(params, "slug");
  const { organization } = await handleAuthorization(authClient, slug);
  await checkSameOrganizationOrThrow(request, organization.id);

  const result = await performMutation({ request, schema, mutation });

  return json<ActionData>(result, { headers: response.headers });
};
