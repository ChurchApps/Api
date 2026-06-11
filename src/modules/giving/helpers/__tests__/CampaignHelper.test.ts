import { CampaignHelper, GivingTotal } from "../CampaignHelper";
import { Campaign, Pledge } from "../../models";

const campaign: Campaign = { id: "CAM00000001", churchId: "CHU00000001", fundId: "FUN00000001", name: "Building Fund Campaign", goalAmount: 50000, startDate: "2026-01-01" };

describe("CampaignHelper", () => {
  describe("getStatus", () => {
    it("returns notStarted when pledged but nothing given", () => {
      expect(CampaignHelper.getStatus(500, 0)).toBe("notStarted");
    });

    it("returns inProgress when given is below the pledge", () => {
      expect(CampaignHelper.getStatus(500, 100)).toBe("inProgress");
    });

    it("returns fulfilled when given equals the pledge", () => {
      expect(CampaignHelper.getStatus(500, 500)).toBe("fulfilled");
    });

    it("returns beyondPledged when given exceeds the pledge", () => {
      expect(CampaignHelper.getStatus(500, 500.01)).toBe("beyondPledged");
    });

    it("returns nonPledged when there is no pledge", () => {
      expect(CampaignHelper.getStatus(0, 250)).toBe("nonPledged");
    });

    it("treats sub-cent floating point differences as equal", () => {
      expect(CampaignHelper.getStatus(100, 99.999999999)).toBe("fulfilled");
      expect(CampaignHelper.getStatus(0.1 + 0.2, 0.3)).toBe("fulfilled");
    });
  });

  describe("buildRows", () => {
    it("merges pledges and giving by person and computes status", () => {
      const pledges: Pledge[] = [
        { id: "PLE00000001", campaignId: campaign.id, personId: "PER00000001", amount: 1000 },
        { id: "PLE00000002", campaignId: campaign.id, personId: "PER00000002", amount: 500 },
        { id: "PLE00000003", campaignId: campaign.id, personId: "PER00000003", amount: 200 }
      ];
      const giving: GivingTotal[] = [
        { campaignId: campaign.id, personId: "PER00000001", amount: 250 },
        { campaignId: campaign.id, personId: "PER00000002", amount: 500 },
        { campaignId: campaign.id, personId: "PER00000004", amount: 75 }
      ];

      const rows = CampaignHelper.buildRows(campaign, pledges, giving);
      const byPerson = Object.fromEntries(rows.map((r) => [r.personId, r]));

      expect(rows).toHaveLength(4);
      expect(byPerson["PER00000001"]).toMatchObject({ pledgedAmount: 1000, givenAmount: 250, status: "inProgress", pledgeId: "PLE00000001" });
      expect(byPerson["PER00000002"]).toMatchObject({ pledgedAmount: 500, givenAmount: 500, status: "fulfilled" });
      expect(byPerson["PER00000003"]).toMatchObject({ pledgedAmount: 200, givenAmount: 0, status: "notStarted" });
      expect(byPerson["PER00000004"]).toMatchObject({ pledgedAmount: 0, givenAmount: 75, status: "nonPledged" });
    });

    it("sums multiple pledges from the same person", () => {
      const pledges: Pledge[] = [
        { id: "PLE00000001", campaignId: campaign.id, personId: "PER00000001", amount: 100 },
        { id: "PLE00000002", campaignId: campaign.id, personId: "PER00000001", amount: 150 }
      ];
      const rows = CampaignHelper.buildRows(campaign, pledges, [{ campaignId: campaign.id, personId: "PER00000001", amount: 300 }]);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ pledgedAmount: 250, givenAmount: 300, status: "beyondPledged" });
    });

    it("keeps anonymous giving as a personId-null row", () => {
      const rows = CampaignHelper.buildRows(campaign, [], [{ campaignId: campaign.id, personId: null, amount: 40 }]);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ personId: null, givenAmount: 40, status: "nonPledged" });
    });

    it("tags every row with the campaign id", () => {
      const rows = CampaignHelper.buildRows(campaign, [{ id: "PLE00000001", campaignId: campaign.id, personId: "PER00000001", amount: 10 }], []);
      expect(rows[0].campaignId).toBe(campaign.id);
    });
  });

  describe("buildProgress", () => {
    const pledges: Pledge[] = [
      { id: "PLE00000001", campaignId: campaign.id, personId: "PER00000001", amount: 1000 },
      { id: "PLE00000002", campaignId: campaign.id, personId: "PER00000002", amount: 500 }
    ];
    const giving: GivingTotal[] = [
      { campaignId: campaign.id, personId: "PER00000001", amount: 250 },
      { campaignId: campaign.id, personId: "PER00000003", amount: 100 },
      { campaignId: campaign.id, personId: null, amount: 50 }
    ];

    it("computes totals across pledged and non-pledged donors", () => {
      const result = CampaignHelper.buildProgress(campaign, pledges, giving, false);
      expect(result.totalPledged).toBe(1500);
      expect(result.totalGiven).toBe(400);
      expect(result.pledgeCount).toBe(2);
      expect(result.donorCount).toBe(3);
      expect(result.campaign).toBe(campaign);
      expect(result.rows).toBeUndefined();
    });

    it("includes per-person rows when requested", () => {
      const result = CampaignHelper.buildProgress(campaign, pledges, giving, true);
      expect(result.rows).toHaveLength(4);
    });

    it("handles a campaign with no pledges and no giving", () => {
      const result = CampaignHelper.buildProgress(campaign, [], [], true);
      expect(result).toMatchObject({ totalPledged: 0, totalGiven: 0, pledgeCount: 0, donorCount: 0, rows: [] });
    });
  });

  describe("buildPeopleRows", () => {
    it("splits pledges and giving per campaign and tags campaign names", () => {
      const second: Campaign = { id: "CAM00000002", churchId: campaign.churchId, fundId: "FUN00000002", name: "Missions Trip" };
      const pledges: Pledge[] = [
        { id: "PLE00000001", campaignId: campaign.id, personId: "PER00000001", amount: 1000 },
        { id: "PLE00000002", campaignId: second.id, personId: "PER00000001", amount: 300 }
      ];
      const giving: GivingTotal[] = [
        { campaignId: campaign.id, personId: "PER00000001", amount: 1000 },
        { campaignId: second.id, personId: "PER00000002", amount: 50 }
      ];

      const rows = CampaignHelper.buildPeopleRows([campaign, second], pledges, giving);

      expect(rows).toHaveLength(3);
      const first = rows.find((r) => r.campaignId === campaign.id && r.personId === "PER00000001");
      expect(first).toMatchObject({ campaignName: "Building Fund Campaign", pledgedAmount: 1000, givenAmount: 1000, status: "fulfilled" });
      const secondPledge = rows.find((r) => r.campaignId === second.id && r.personId === "PER00000001");
      expect(secondPledge).toMatchObject({ campaignName: "Missions Trip", pledgedAmount: 300, givenAmount: 0, status: "notStarted" });
      const nonPledged = rows.find((r) => r.campaignId === second.id && r.personId === "PER00000002");
      expect(nonPledged).toMatchObject({ pledgedAmount: 0, givenAmount: 50, status: "nonPledged" });
    });
  });
});
