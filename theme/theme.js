import React from "react";
import { View, Pressable, StyleSheet } from "react-native";

// =====================================
// ROUTEX - BLUE SOFT NEUMORPHISM THEME
// (lightweight version for mobile)
// =====================================
//
// What changed vs. the heavy version:
//  - Raised: 5 stacked shadow layers -> 2 layers (one dark, one light), smaller blur
//  - Inset/pressed: inset boxShadow (expensive) -> flat color + 2px side borders
//    (dark top/left, light bottom/right), which gives the same "pressed in" look
//  - Gradient backgrounds are now opt-in (`gradient` prop) instead of on every surface
//  - Style objects are precomputed once, so nothing is flattened or rebuilt per render
//  - Background shifted slightly bluer; surface, inset and shadows retuned to match

export const C = {
  blue: "#286DF6",
  secondary: "#5A95FC",
  lightBlue: "#9DC6FB",
  white: "#FFFFFF",

  background: "#D3E1F8",
  surface: "#E5EDFB",
  inset: "#D6E3F7",
  card: "#E5EDFB",

  lightShadow: "#FFFFFF",
  darkShadow: "#BCCFEA",

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

const DARK = "#A3B9E0";
const LIGHT = "#FFFFFF";

// Two shadow layers only: that's all the neumorphic look needs.
export const NEU = {
  raised: {
    boxShadow: `6px 6px 12px ${DARK}, -6px -6px 12px ${LIGHT}`,
  },
  raisedSmall: {
    boxShadow: `3px 3px 6px ${DARK}, -3px -3px 6px ${LIGHT}`,
  },
  // Fake inset: no inset shadow, just opposing border colors.
  inset: {
    backgroundColor: C.inset,
    borderWidth: 2,
    borderTopColor: DARK,
    borderLeftColor: DARK,
    borderBottomColor: LIGHT,
    borderRightColor: LIGHT,
  },
  pressed: {
    backgroundColor: C.inset,
    borderWidth: 2,
    borderTopColor: DARK,
    borderLeftColor: DARK,
    borderBottomColor: LIGHT,
    borderRightColor: LIGHT,
  },
};

// Kept for compatibility. Only applied when you pass `gradient`.
export const GRADIENT = {
  raised: "linear-gradient(145deg, #F2F7FF, #D9E5F8)",
  inset: "linear-gradient(145deg, #CFDDF3, #EAF1FD)",
};

const GRADIENT_STYLE = {
  raised: { experimental_backgroundImage: GRADIENT.raised },
  inset: { experimental_backgroundImage: GRADIENT.inset },
};

export const blueGlow = {
  boxShadow: `3px 4px 8px #A9C0EC, -3px -3px 8px ${LIGHT}`,
};

export const redGlow = {
  boxShadow: `3px 4px 8px #E3B3BD, -3px -3px 8px ${LIGHT}`,
};

export function NeuView({ children, style, small, inset, gradient, ...rest }) {
  return (
    <View
      style={[
        base.neuBase,
        inset ? NEU.inset : small ? NEU.raisedSmall : NEU.raised,
        gradient && (inset ? GRADIENT_STYLE.inset : GRADIENT_STYLE.raised),
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
  gradient,
  activeOpacity, // accepted but unused, kept so existing call sites don't break
  ...rest
}) {
  return (
    <Pressable
      style={({ pressed }) => {
        const down = pressed && !rest.disabled;

        return [
          base.neuBase,
          down ? NEU.pressed : small ? NEU.raisedSmall : NEU.raised,
          gradient && !down && GRADIENT_STYLE.raised,
          style,
        ];
      }}
      {...rest}
    >
      {children}
    </Pressable>
  );
}

export function NeuCard({ children, style, ...rest }) {
  return (
    <NeuView style={[base.neuCard, style]} {...rest}>
      {children}
    </NeuView>
  );
}

// Blue icon container
export function NeuIconBox({ children, style }) {
  return <View style={[base.iconBox, style]}>{children}</View>;
}

const base = StyleSheet.create({
  neuBase: {
    backgroundColor: C.surface,
    borderWidth: 0,
  },

  neuCard: {
    backgroundColor: C.card,
    borderRadius: 24,
  },

  // Single cheap shadow instead of shadowColor + elevation combo
  iconBox: {
    backgroundColor: C.iconBackground,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "2px 3px 6px rgba(40,109,246,0.3)",
  },
});
