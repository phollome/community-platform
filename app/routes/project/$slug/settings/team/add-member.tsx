import { ActionFunction } from "remix";
import { InputError, makeDomainFunction } from "remix-domains";
import { PerformMutation, performMutation } from "remix-forms";
import { Schema, z } from "zod";
import { getUserByRequestOrThrow } from "~/auth.server";
import { checkFeatureAbilitiesOrThrow } from "~/lib/utils/application";
import { getProfileByEmail } from "~/routes/organization/$slug/settings/utils.server";
import { checkIdentityOrThrow } from "~/routes/project/utils.server";
import { getProjectByIdOrThrow } from "../../utils.server";
import {
  checkOwnershipOrThrow,
  checkSameProjectOrThrow,
} from "../utils.server";
import { connectProfileToProject } from "./utils.server";

const schema = z.object({
  userId: z.string(),
  projectId: z.string(),
  email: z.string().email(),
});

export const addMemberSchema = schema;

const mutation = makeDomainFunction(schema)(async (values) => {
  const profile = await getProfileByEmail(values.email);
  if (profile === null) {
    throw new InputError(
      "Es existiert noch kein Profil unter dieser E-Mail.",
      "email"
    );
  }
  const alreadyMember = profile.teamMemberOfProjects.some((entry) => {
    return entry.project.id === values.projectId;
  });
  if (alreadyMember) {
    throw new InputError(
      "Das Profil unter dieser E-Mail ist bereits Mitglied Eures Projektes.",
      "email"
    );
  }
  return values;
});

export type ActionData = PerformMutation<
  z.infer<Schema>,
  z.infer<typeof schema>
>;

export const action: ActionFunction = async (args) => {
  const { request } = args;
  await checkFeatureAbilitiesOrThrow(request, "projects");

  const currentUser = await getUserByRequestOrThrow(request);
  await checkIdentityOrThrow(request, currentUser);

  const result = await performMutation({ request, schema, mutation });

  if (result.success === true) {
    const project = await getProjectByIdOrThrow(result.data.projectId);
    await checkOwnershipOrThrow(project, currentUser);
    await checkSameProjectOrThrow(request, project.id);
    const teamMemberProfile = await getProfileByEmail(result.data.email);
    if (teamMemberProfile !== null) {
      await connectProfileToProject(project.id, teamMemberProfile.id);
    }
  }
  return result;
};