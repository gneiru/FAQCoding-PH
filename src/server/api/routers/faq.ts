import { z } from "zod";

import { FAQFormSchema } from "~/pages/index";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import type { faq } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";
import { filterUserForClient } from "~/utils/filterUserForClient";
import { TRPCError } from "@trpc/server";

const addUserDataToFAQs = async (faqs: faq[]) => {
  const userId = faqs.map((faq) => faq.userid);
  const users = (
    await clerkClient.users.getUserList({
      userId: userId,
      limit: 110,
    })
  ).map(filterUserForClient);

  return faqs.map((faq) => {
    const user = users.find((user) => user.id === faq.userid);

    if (!user) {
      console.error("AUTHOR NOT FOUND", faq);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Author for post not found. POST ID: ${faq.id}, USER ID: ${faq.userid}`,
      });
    }
    if (!user.username) {
      // user the ExternalUsername
      if (!user.externalUsername) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Author has no GitHub Account: ${user.id}`,
        });
      }
      user.username = user.externalUsername;
    }
    return {
      faq,
      user: {
        ...user,
        username: user.username ?? "(username not found)",
      },
    };
  });
};

export const faqRouter = createTRPCRouter({
  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.prisma.faq.findUnique({
        where: {
          id: input.id,
        },
      });
    }),

  getAll: publicProcedure.query(async ({ ctx }) => {
    const faqs = await ctx.prisma.faq.findMany({
      take: 100,
      orderBy: [{ createdAt: "desc" }],
    });

    return addUserDataToFAQs(faqs);
  }),

  create: protectedProcedure
    .input(FAQFormSchema)
    .mutation(({ ctx, input }) => {
    const userId = ctx.auth.userId;
      return ctx.prisma.faq.create({
        data: {
          question: input.question,
          answer: input.answer,
          userid: userId,
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.prisma.faq.delete({
        where: {
          id: input.id,
        },
      });
    }),
});
