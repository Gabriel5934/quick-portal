import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import AppBar from "@mui/material/AppBar";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import TextField from "@mui/material/TextField";
import Toolbar from "@mui/material/Toolbar";
import { createTheme, ThemeProvider, useTheme } from "@mui/material/styles";
import StoreIcon from "@mui/icons-material/Store";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import {
  useAllBusinesses,
  useBusinessColor,
  type Business,
  type BusinessColor,
} from "#hooks/quickApi/useBusinesses";
import { BusinessScopeContext } from "./business-context";
import { useBusinessSelection } from "./business-selection";

const BUSINESS_DRAWER_WIDTH = 240;
const BUSINESS_COLORS: Record<BusinessColor, string> = {
  blue: "#42a5f5",
  green: "#4caf50",
  yellow: "#ff9800",
  purple: "#ba68c8",
  orange: "#963600",
};
const COLOR_NAMES = Object.keys(BUSINESS_COLORS) as BusinessColor[];

interface BusinessLayoutProps {
  children: ReactNode;
}

function businessGroup(business: Business): "Estabelecimento" | "Revenda" {
  return business.type === "STORE" ? "Estabelecimento" : "Revenda";
}

const navigation = [
  {
    to: "/sales",
    activePaths: ["/sales"],
    label: "Vendas",
    icon: <PointOfSaleIcon />,
    adminOnly: false,
  },
  {
    to: "/credenciamento",
    activePaths: ["/credenciamento"],
    label: "Credenciamento",
    icon: <StoreIcon />,
    adminOnly: true,
  },
  {
    to: "/planos-cielo",
    activePaths: ["/planos-cielo"],
    label: "Planos Cielo",
    icon: <CreditCardIcon />,
    adminOnly: true,
  },
] as const;

export function BusinessLayout({ children }: BusinessLayoutProps) {
  const outerTheme = useTheme();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const { selectedBusinessId: businessId, selectBusiness } =
    useBusinessSelection();
  const [colorsExpanded, setColorsExpanded] = useState(false);
  const colorMutation = useBusinessColor();
  const { data: businesses = [], isLoading } = useAllBusinesses();

  const accessibleIds = new Set(businesses.map((business) => business.id));
  const highestLevelBusinesses = businesses.filter(
    (business) =>
      business.parent === null || !accessibleIds.has(business.parent),
  );
  const selectedBusiness =
    businessId === undefined
      ? (highestLevelBusinesses[0] ?? null)
      : (businesses.find((business) => business.id === businessId) ?? null);
  const selectedColor = selectedBusiness?.color ?? "blue";
  const colorOptions = [
    selectedColor,
    ...COLOR_NAMES.filter((color) => color !== selectedColor),
  ];
  const businessTheme = useMemo(
    () =>
      createTheme(outerTheme, {
        palette: { primary: { main: BUSINESS_COLORS[selectedColor] } },
      }),
    [outerTheme, selectedColor],
  );
  const options = businesses.toSorted((left, right) => {
    const groupComparison = businessGroup(right).localeCompare(
      businessGroup(left),
      "pt-BR",
    );
    if (groupComparison !== 0) return groupComparison;
    return (left.trade_name || left.name).localeCompare(
      right.trade_name || right.name,
      "pt-BR",
    );
  });
  const scope = useMemo(
    () => ({ business: selectedBusiness, isLoading }),
    [selectedBusiness, isLoading],
  );

  return (
    <BusinessScopeContext value={scope}>
      <ThemeProvider theme={businessTheme}>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            height: "calc(100vh - 64px)",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <AppBar
            position="relative"
            color="inherit"
            elevation={0}
            sx={{ flexShrink: 0, borderBottom: 1, borderColor: "divider" }}
          >
            <Toolbar sx={{ gap: 1.5, py: 1 }}>
              <Autocomplete
                options={options}
                value={selectedBusiness}
                loading={isLoading}
                groupBy={businessGroup}
                onChange={(_, selected) => {
                  selectBusiness(selected?.id ?? null);
                  setColorsExpanded(false);
                  void navigate({ to: "/sales" });
                }}
                getOptionLabel={(option) => option.trade_name || option.name}
                isOptionEqualToValue={(option, selected) =>
                  option.id === selected.id
                }
                sx={{ width: "100%", maxWidth: 520 }}
                renderInput={(params) => (
                  <TextField {...params} label="Perfil" size="small" />
                )}
              />
              <RadioGroup
                row
                aria-label="Cor da empresa"
                value={selectedColor}
                onChange={(_, value) => {
                  if (!selectedBusiness) return;
                  colorMutation.mutate({
                    id: selectedBusiness.id,
                    color: value as BusinessColor,
                  });
                }}
                sx={{ flexWrap: "nowrap" }}
              >
                {colorOptions.map((color, index) =>
                  colorsExpanded || index === 0 ? (
                    <Radio
                      key={color}
                      value={color}
                      slotProps={{ input: { "aria-label": color } }}
                      onClick={() => {
                        setColorsExpanded(index === 0 && !colorsExpanded);
                      }}
                      sx={{
                        color: BUSINESS_COLORS[color],
                        "&.Mui-checked": { color: BUSINESS_COLORS[color] },
                      }}
                    />
                  ) : null,
                )}
              </RadioGroup>
            </Toolbar>
          </AppBar>

          <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
            <Drawer
              variant="permanent"
              sx={{
                width: BUSINESS_DRAWER_WIDTH,
                flexShrink: 0,
                "& .MuiDrawer-paper": {
                  position: "relative",
                  width: BUSINESS_DRAWER_WIDTH,
                  boxSizing: "border-box",
                },
              }}
            >
              <List>
                {navigation
                  .filter(
                    (item) =>
                      !item.adminOnly || selectedBusiness?.role === "ADMIN",
                  )
                  .map((item) => (
                    <ListItem key={item.to} disablePadding>
                      <ListItemButton
                        component={Link}
                        to={item.to}
                        selected={item.activePaths.some(
                          (activePath) =>
                            activePath === pathname ||
                            pathname.startsWith(`${activePath}/`),
                        )}
                        sx={{
                          "&.Mui-selected": {
                            bgcolor: "primary.main",
                            color: "primary.contrastText",
                            "&:hover": { bgcolor: "primary.main" },
                            "& .MuiListItemIcon-root": {
                              color: "primary.contrastText",
                            },
                          },
                        }}
                      >
                        <ListItemIcon>{item.icon}</ListItemIcon>
                        <ListItemText primary={item.label} />
                      </ListItemButton>
                    </ListItem>
                  ))}
              </List>
            </Drawer>

            <Box
              component="main"
              sx={{
                flexGrow: 1,
                minWidth: 0,
                minHeight: 0,
                overflow: "auto",
                p: 3,
              }}
            >
              {children}
            </Box>
          </Box>
        </Box>
      </ThemeProvider>
    </BusinessScopeContext>
  );
}
