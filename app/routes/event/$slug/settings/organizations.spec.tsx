import type { User } from "@supabase/supabase-js";
import * as authServerModule from "~/auth.server";
import { testURL } from "~/lib/utils/tests";
import { prismaClient } from "~/prisma";
import { loader } from "./organizations";

// @ts-ignore
const expect = global.expect as jest.Expect;

const getSessionUserOrThrow = jest.spyOn(
  authServerModule,
  "getSessionUserOrThrow"
);

const slug = "slug-test";

jest.mock("~/prisma", () => {
  return {
    prismaClient: {
      event: {
        findFirst: jest.fn(),
      },
      teamMemberOfEvent: {
        findFirst: jest.fn(),
      },
    },
  };
});

describe("/event/$slug/settings/organizations", () => {
  beforeAll(() => {
    process.env.FEATURES = "events";
  });

  test("no params", async () => {
    expect.assertions(2);

    const request = new Request(testURL);
    try {
      await loader({ request, context: {}, params: {} });
    } catch (error) {
      const response = error as Response;
      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.message).toBe('"slug" missing');
    }
  });

  test("anon user", async () => {
    expect.assertions(2);

    try {
      await loader({
        request: new Request(testURL),
        context: {},
        params: { slug },
      });
    } catch (error) {
      const response = error as Response;
      expect(response.status).toBe(401);

      const json = await response.json();
      expect(json.message).toBe("No session or session user found");
    }
  });

  test("event not found", async () => {
    expect.assertions(2);

    (prismaClient.event.findFirst as jest.Mock).mockResolvedValue(null);

    getSessionUserOrThrow.mockResolvedValue({ id: "some-user-id" } as User);

    const request = new Request(testURL);
    try {
      await loader({ request, context: {}, params: { slug } });
    } catch (error) {
      const response = error as Response;
      expect(response.status).toBe(404);

      const json = await response.json();
      expect(json.message).toBe("Event not found");
    }
  });

  test("not privileged user", async () => {
    expect.assertions(2);

    getSessionUserOrThrow.mockResolvedValue({ id: "some-user-id" } as User);

    (prismaClient.event.findFirst as jest.Mock).mockImplementationOnce(() => {
      return { slug };
    });
    (
      prismaClient.teamMemberOfEvent.findFirst as jest.Mock
    ).mockImplementationOnce(() => {
      return null;
    });

    try {
      await loader({
        request: new Request(testURL),
        context: {},
        params: { slug },
      });
    } catch (error) {
      const response = error as Response;
      expect(response.status).toBe(401);

      const json = await response.json();
      expect(json.message).toBe("Not privileged");
    }
  });

  test("privileged user", async () => {
    getSessionUserOrThrow.mockResolvedValue({ id: "some-user-id" } as User);

    (
      prismaClient.teamMemberOfEvent.findFirst as jest.Mock
    ).mockImplementationOnce(() => {
      return { isPrivileged: true };
    });
    (prismaClient.event.findFirst as jest.Mock).mockImplementationOnce(() => {
      return {
        slug,
        responsibleOrganizations: [
          {
            organization: {
              id: "some-organization-id",
              name: "Some Organization",
              slug: "someorganization",
              logo: null,
            },
          },
          {
            organization: {
              id: "another-organization-id",
              name: "Another Organization",
              slug: "anotherorganization",
              logo: null,
            },
          },
          {
            organization: {
              id: "yet-another-organization-id",
              name: "Yet Another Organization",
              slug: "yetanotherorganization",
              logo: null,
            },
          },
        ],
      };
    });

    const response = await loader({
      request: new Request(testURL),
      context: {},
      params: { slug },
    });

    const responseBody = await response.json();

    expect(responseBody.responsibleOrganizations.length).toBe(3);
    expect(responseBody.responsibleOrganizations).toEqual([
      {
        id: "some-organization-id",
        name: "Some Organization",
        slug: "someorganization",
        logo: null,
      },
      expect.objectContaining({
        id: "another-organization-id",
        name: "Another Organization",
      }),
      expect.objectContaining({
        id: "yet-another-organization-id",
        slug: "yetanotherorganization",
      }),
    ]);
  });

  afterAll(() => {
    delete process.env.FEATURES;
  });
});
