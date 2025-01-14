import type { User } from "@supabase/supabase-js";
import * as authServerModule from "~/auth.server";
import { prismaClient } from "~/prisma";
import { testURL } from "~/lib/utils/tests";
import { loader } from "./events";

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
        findMany: jest.fn(),
      },
    },
  };
});

describe("/event/$slug/settings/events", () => {
  describe("loader (privileged user)", () => {
    beforeAll(() => {
      process.env.FEATURES = "events";
    });

    test("no other events where user is privileged", async () => {
      expect.assertions(1);

      getSessionUserOrThrow.mockResolvedValue({ id: "some-user-id" } as User);
      (prismaClient.event.findFirst as jest.Mock).mockImplementationOnce(() => {
        return { slug, childEvents: [], parentEvent: null };
      });
      (
        prismaClient.teamMemberOfEvent.findFirst as jest.Mock
      ).mockImplementationOnce(() => {
        return { isPrivileged: true };
      });
      (
        prismaClient.teamMemberOfEvent.findMany as jest.Mock
      ).mockImplementationOnce(() => {
        return [];
      });

      const response = await loader({
        request: new Request(testURL),
        context: {},
        params: { slug },
      });
      const responseBody = await response.json();
      expect(responseBody.options).toEqual([]);
    });

    test("user is privileged on other events", async () => {
      expect.assertions(1);

      getSessionUserOrThrow.mockResolvedValue({ id: "some-user-id" } as User);
      (prismaClient.event.findFirst as jest.Mock).mockImplementationOnce(() => {
        return { slug, childEvents: [], parentEvent: null };
      });
      (
        prismaClient.teamMemberOfEvent.findFirst as jest.Mock
      ).mockImplementationOnce(() => {
        return { isPrivileged: true };
      });
      (
        prismaClient.teamMemberOfEvent.findMany as jest.Mock
      ).mockImplementationOnce(() => {
        return [
          {
            event: {
              id: "another-event-id",
              name: "Another Event",
              parentEventId: "a-parent-event-id",
            },
          },
          {
            event: {
              id: "yet-another-event-id",
              name: "Yet Another Event",
              parentEventId: null,
            },
          },
        ];
      });

      const response = await loader({
        request: new Request(testURL),
        context: {},
        params: { slug },
      });
      const responseBody = await response.json();
      expect(responseBody.options).toEqual([
        {
          label: "Another Event",
          value: "another-event-id",
          hasParent: true,
        },
        {
          label: "Yet Another Event",
          value: "yet-another-event-id",
          hasParent: false,
        },
      ]);
    });

    test("event has still parent event", async () => {
      expect.assertions(2);

      getSessionUserOrThrow.mockResolvedValue({ id: "some-user-id" } as User);
      (prismaClient.event.findFirst as jest.Mock).mockImplementationOnce(() => {
        return {
          slug,
          childEvents: [],
          parentEvent: {
            id: "parent-event-id",
            name: "Parent Event",
            background: null,
          },
        };
      });
      (
        prismaClient.teamMemberOfEvent.findFirst as jest.Mock
      ).mockImplementationOnce(() => {
        return { isPrivileged: true };
      });
      (
        prismaClient.teamMemberOfEvent.findMany as jest.Mock
      ).mockImplementationOnce(() => {
        return [];
      });

      const response = await loader({
        request: new Request(testURL),
        context: {},
        params: { slug },
      });
      const responseBody = await response.json();
      expect(responseBody.parentEvent.id).toBe("parent-event-id");
      expect(responseBody.parentEvent.name).toBe("Parent Event");
    });

    afterAll(() => {
      delete process.env.FEATURES;
    });
  });
});
