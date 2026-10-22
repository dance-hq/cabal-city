import { describe, expect, it } from "vitest";
import {
  forwardFrom,
  forwardNote,
  forwardTargets,
  ownAddress,
  parseSender,
  pickAttachments,
  skipReason,
  withNote,
} from "@/lib/inbound-mail";

describe("inbound mail forwarding", () => {
  it("reads sender names and addresses", () => {
    expect(parseSender("Jane Doe <jane@example.com>")).toEqual({
      name: "Jane Doe",
      address: "jane@example.com",
    });
    expect(parseSender('"Doe, Jane" <jane@example.com>')).toEqual({
      name: "Doe, Jane",
      address: "jane@example.com",
    });
    expect(parseSender("jane@example.com")).toEqual({
      name: "",
      address: "jane@example.com",
    });
  });

  it("sends from our own address with the sender as the name", () => {
    expect(
      forwardFrom(
        { name: "Jane", address: "jane@example.com" },
        "matt@cabal.city",
      ),
    ).toBe("Jane via Cabal <matt@cabal.city>");
    expect(
      forwardFrom({ name: "", address: "jane@example.com" }, "matt@cabal.city"),
    ).toBe("jane@example.com via Cabal <matt@cabal.city>");
    expect(
      forwardFrom(
        { name: 'Evil" <x@y.z>\r\nBcc: a@b.c', address: "e@x.com" },
        "matt@cabal.city",
      ),
    ).toBe("Evil x@y.zBcc: a@b.c via Cabal <matt@cabal.city>");
  });

  it("only accepts real addresses as targets", () => {
    expect(forwardTargets(" a@gmail.com, nope ,b@x.io ")).toEqual([
      "a@gmail.com",
      "b@x.io",
    ]);
    expect(forwardTargets(undefined)).toEqual([]);
  });

  it("takes our address from the sending setting", () => {
    expect(ownAddress("Cabal <matt@cabal.city>")).toBe("matt@cabal.city");
    expect(ownAddress("matt@cabal.city")).toBe("matt@cabal.city");
    expect(ownAddress("")).toBeNull();
  });

  it("never forwards its own copies, spam or viruses", () => {
    expect(skipReason({ "x-cabal-forwarded": "1" })).toBe("already-forwarded");
    expect(skipReason({ "X-SES-Spam-Verdict": "FAIL" })).toBe("spam");
    expect(skipReason({ "x-ses-virus-verdict": "fail" })).toBe("virus");
    expect(skipReason({ "x-ses-spam-verdict": "PASS" })).toBeNull();
    expect(skipReason(null)).toBeNull();
  });

  it("keeps attachments under the size limit and lists the rest", () => {
    const files = [
      { id: "1", filename: "a.pdf", size: 6 },
      { id: "2", filename: "big.mov", size: 20 },
      { id: "3", filename: "b.png", size: 4 },
    ];
    const { keep, dropped } = pickAttachments(files, 10);
    expect(keep.map((f) => f.id)).toEqual(["1", "3"]);
    expect(dropped.map((f) => f.id)).toEqual(["2"]);
  });

  it("puts the note inside the body and escapes it", () => {
    const note = forwardNote({
      from: "Jane <jane@example.com>",
      to: ["matt@cabal.city"],
      dropped: [],
    });
    expect(note.text).toBe(
      "From Jane <jane@example.com> to matt@cabal.city\n\n",
    );
    expect(note.html).toContain("Jane &lt;jane@example.com&gt;");
    expect(
      withNote('<html><body class="x"><p>Hi</p></body></html>', "<i>n</i>"),
    ).toBe('<html><body class="x"><i>n</i><p>Hi</p></body></html>');
    expect(withNote("<p>Hi</p>", "<i>n</i>")).toBe("<i>n</i><p>Hi</p>");
  });
});
