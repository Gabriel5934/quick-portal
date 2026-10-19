import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useAcceptInvite,
  useDeclineInvite,
  useReceivedInvites,
} from "#hooks/quickApi/useBusinessAccess";
import { ReceivedInvitesPage } from "./received-invites-page";
import type { ReceivedInvite } from "./types";

const navigate = vi.hoisted(() => vi.fn());
const selectBusiness = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("../../layout/business-selection", () => ({
  useBusinessSelection: () => ({ selectBusiness }),
}));
vi.mock("#hooks/quickApi/useBusinessAccess", () => ({
  useAcceptInvite: vi.fn(),
  useDeclineInvite: vi.fn(),
  useReceivedInvites: vi.fn(),
}));

const invite: ReceivedInvite = {
  id: 3,
  business: { id: 7, type: "STORE", name: "Loja Ltda", trade_name: "Loja" },
  role: "MANAGER",
  invited_by_email: "admin@example.com",
  created_at: "2026-10-01T10:00:00Z",
};

describe("ReceivedInvitesPage", () => {
  const accept = vi.fn();
  const decline = vi.fn();

  beforeEach(() => {
    accept.mockReset();
    decline.mockReset();
    vi.mocked(useReceivedInvites).mockReturnValue({
      data: [invite],
      isLoading: false,
      error: null,
    } as never);
    vi.mocked(useAcceptInvite).mockReturnValue({
      mutate: accept,
      isPending: false,
      error: null,
    } as never);
    vi.mocked(useDeclineInvite).mockReturnValue({
      mutate: decline,
      isPending: false,
      error: null,
    } as never);
  });

  it("shows the business, role and inviter", () => {
    render(<ReceivedInvitesPage />);

    expect(screen.getByText("Loja")).toBeInTheDocument();
    expect(screen.getByText("Papel: Gerente")).toBeInTheDocument();
    expect(
      screen.getByText(/Convidado por admin@example.com/),
    ).toBeInTheDocument();
  });

  it("opens the business after accepting", async () => {
    accept.mockImplementation((_id, options: { onSuccess: () => void }) =>
      options.onSuccess(),
    );
    const user = userEvent.setup();
    render(<ReceivedInvitesPage />);

    await user.click(screen.getByRole("button", { name: "Aceitar" }));

    expect(accept).toHaveBeenCalledWith(3, expect.anything());
    expect(selectBusiness).toHaveBeenCalledWith(7);
    expect(navigate).toHaveBeenCalledWith({ to: "/sales" });
  });

  it("declines an invite", async () => {
    const user = userEvent.setup();
    render(<ReceivedInvitesPage />);

    await user.click(screen.getByRole("button", { name: "Recusar" }));

    expect(decline).toHaveBeenCalledWith(3);
  });

  it("says when there are no invites", () => {
    vi.mocked(useReceivedInvites).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never);
    render(<ReceivedInvitesPage />);

    expect(screen.getByText("Nenhum convite pendente")).toBeInTheDocument();
  });
});
