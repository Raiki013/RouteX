
import React from "react";
import { View, Pressable, StyleSheet } from "react-native";

// =====================================
// ROUTEX - BLUE SOFT NEUMORPHISM THEME
// =====================================

export const C = {
  blue: "#286DF6",
  secondary: "#5A95FC",
  lightBlue: "#9DC6FB",
  white: "#FFFFFF",

  background: "#DDE6F4",
  surface: "#EFF4FC",
  inset: "#E1E9F6",
  card: "#EFF4FC",

  lightShadow: "#FFFFFF",
  darkShadow: "#C5D4E9",

  text: "#16346B",
  textSecondary: "#2F4F86",
  muted: "#5F7FB3",

  green: "#286DF6",
  red: "#D9485F",
  danger: "#D9485F",

  paleBlue: "#D3E3FB",
  paleRed: "#F6DCE3",

  // Blue icon containers
  iconBackground: "#286DF6",
  iconColor: "#FFFFFF",
};

export const NEU = {
  raised: {
    boxShadow:
      "12px 12px 24px #B0C1DE, -12px -12px 24px #FFFFFF, 2px 2px 4px rgba(150,170,205,0.45), inset 1px 1px 2px #FFFFFF, inset -1px -1px 2px rgba(160,180,215,0.35)",
  },
  raisedSmall: {
    boxShadow:
      "6px 6px 12px #B0C1DE, -6px -6px 12px #FFFFFF, 1px 1px 3px rgba(150,170,205,0.45), inset 1px 1px 2px #FFFFFF, inset -1px -1px 2px rgba(160,180,215,0.35)",
  },
  inset: {
    boxShadow:
      "inset 5px 5px 10px #B0C1DE, inset -5px -5px 10px #FFFFFF, 1px 1px 1px rgba(255,255,255,0.9)",
  },
  pressed: {
    boxShadow:
      "inset 7px 7px 14px #B0C1DE, inset -7px -7px 14px #FFFFFF",
  },
};

export const GRADIENT = {
  raised: "linear-gradient(145deg, #FAFCFF, #E3EBF7)",
  inset: "linear-gradient(145deg, #DAE3F1, #F3F7FD)",
};

export const blueGlow = {
  boxShadow: "4px 6px 12px #A9C0EC, -4px -4px 10px #FFFFFF",
};

export const redGlow = {
  boxShadow: "4px 6px 12px #E3B3BD, -4px -4px 10px #FFFFFF",
};

const SURFACE_COLORS = [C.surface, C.card, C.inset];

function surfaceGradient(flat, kind) {
  const bg = flat.backgroundColor;
  if (bg && !SURFACE_COLORS.includes(bg)) return null;
  return { experimental_backgroundImage: GRADIENT[kind] };
}

export function NeuView({ children, style, small, inset, ...rest }) {
  const flat = StyleSheet.flatten(style) || {};

  return (
    <View
      style={[
        base.neuBase,
        inset ? NEU.inset : small ? NEU.raisedSmall : NEU.raised,
        inset && base.insetBase,
        surfaceGradient(flat, inset ? "inset" : "raised"),
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

export function NeuTouchable({
  children,
  style,
  small,
  activeOpacity,
  ...rest
}) {
  const flat = StyleSheet.flatten(style) || {};

  return (
    <Pressable
      style={({ pressed }) => {
        const down = pressed && !rest.disabled;

        return [
          base.neuBase,
          down ? NEU.pressed : small ? NEU.raisedSmall : NEU.raised,
          surfaceGradient(flat, down ? "inset" : "raised"),
          style,
        ];
      }}
      {...rest}
    >
      {children}
    </Pressable>
  );
}

export function NeuCard({ children, style }) {
  return (
    <NeuView style={[base.neuCard, style]}>
      {children}
    </NeuView>
  );
}

// Blue icon container
export function NeuIconBox({ children, style }) {
  return (
    <View style={[base.iconBox, style]}>
      {children}
    </View>
  );
}

const base = StyleSheet.create({
  neuBase: {
    backgroundColor: C.surface,
    borderWidth: 0,
  },

  insetBase: {
    backgroundColor: C.inset,
    borderWidth: 0,
    elevation: 0,
  },

  neuCard: {
    backgroundColor: C.card,
    borderRadius: 24,
  },

  iconBox: {
    backgroundColor: C.iconBackground,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: C.blue,
    shadowOffset: {
      width: 3,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 4,
  },
});
