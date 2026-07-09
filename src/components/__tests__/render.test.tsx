import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import NikkiCard from "../user/NikkiCard";
import EmptyState from "../shared/EmptyState";
import Avatar from "../shared/Avatar";
import PairingCode from "../shared/PairingCode";
import { Button } from "../../primitives";

describe("component rendering", () => {
  it("renders the signature Nikki card with its message", async () => {
    await render(<NikkiCard message="Good morning, Anna." />);
    expect(screen.getByText("Good morning, Anna.")).toBeTruthy();
    expect(screen.getByText("NIKKI")).toBeTruthy();
  });

  it("renders a designed empty state", async () => {
    await render(<EmptyState icon="people" title="No people yet" subtitle="Add the family." />);
    expect(screen.getByText("No people yet")).toBeTruthy();
    expect(screen.getByText("Add the family.")).toBeTruthy();
  });

  it("shows a monogram when a person has no photo", async () => {
    await render(<Avatar name="Sophie de Vries" />);
    expect(screen.getByText("SV")).toBeTruthy();
  });

  it("formats a household code as XXXX XXXX", async () => {
    await render(<PairingCode code="ABCD1234" />);
    expect(screen.getByText("ABCD 1234")).toBeTruthy();
  });

  it("fires the button press handler", async () => {
    const onPress = jest.fn();
    await render(<Button label="Save" onPress={onPress} />);
    fireEvent.press(screen.getByText("Save"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
