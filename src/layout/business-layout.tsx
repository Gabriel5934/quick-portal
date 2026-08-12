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
import AddIcon from "@mui/icons-material/Add";
import StoreIcon from "@mui/icons-material/Store";
import RequestQuoteIcon from "@mui/icons-material/RequestQuote";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import {
  useAllBusinesses,
  useBusinessColor,
  type Business,
  type BusinessColor,
} from "#hooks/quickApi/useBusinesses";
import { BusinessScopeContext } from "./business-context";

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
    nonStoreOnly: false,
  },
  {
    to: "/business-list",
    activePaths: ["/business-list"],
    label: "Estabelecimentos",
    icon: <StoreIcon />,
    nonStoreOnly: true,
  },
  {
    to: "/novo-ec",
    activePaths: ["/novo-ec", "/completar-ec"],
    label: "Cadastro",
    icon: <AddIcon />,
    nonStoreOnly: true,
  },
  {
    to: "/recurring-fees",
    activePaths: [
      "/recurring-fees",
      "/recurring-fees/new/details",
      "/recurring-fees/new/pricing",
      "/recurring-fees/new/schedule",
      "/recurring-fees/new/targets",
      "/recurring-fees/new/review",
    ],
    label: "Taxas Recorrentes",
    icon: <AutorenewIcon />,
    nonStoreOnly: true,
  },
  {
    to: "/planos-e-taxas",
    activePaths: ["/planos-e-taxas", "/novo-plano"],
    label: "Planos e Taxas",
    icon: <RequestQuoteIcon />,
    nonStoreOnly: true,
  },
] as const;

export function BusinessLayout({ children }: BusinessLayoutProps) {
  const outerTheme = useTheme();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [businessId, setBusinessId] = useState<number | null | undefined>();
  const [colorsExpanded, setColorsExpanded] = useState(false);
  const colorMutation = useBusinessColor();
  const { data: hierarchy = [], isLoading } = useAllBusinesses();

  const accessibleIds = new Set(hierarchy.map((business) => business.id));
  const highestLevelBusinesses = hierarchy.filter(
    (business) =>
      business.parent === null || !accessibleIds.has(business.parent),
  );
  const selectedBusiness =
    businessId === undefined
      ? (highestLevelBusinesses[0] ?? null)
      : (hierarchy.find((business) => business.id === businessId) ?? null);
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
  const options = hierarchy.toSorted((left, right) => {
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
    () => ({ business: selectedBusiness }),
    [selectedBusiness],
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
                  setBusinessId(selected?.id ?? null);
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
                      !item.nonStoreOnly || selectedBusiness?.type !== "STORE",
                  )
                  .map((item) => (
                    <ListItem key={item.to} disablePadding>
                      <ListItemButton
                        component={Link}
                        to={item.to}
                        selected={item.activePaths.some(
                          (activePath) => activePath === pathname,
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
