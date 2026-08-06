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
import TextField from "@mui/material/TextField";
import Toolbar from "@mui/material/Toolbar";
import AddIcon from "@mui/icons-material/Add";
import StoreIcon from "@mui/icons-material/Store";
import RequestQuoteIcon from "@mui/icons-material/RequestQuote";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import { useAllBusinesses, type Business } from "#hooks/quickApi/useBusinesses";
import { BusinessScopeContext } from "./business-context";

const BUSINESS_DRAWER_WIDTH = 240;

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
    label: "Credenciamento",
    icon: <AddIcon />,
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
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [business, setBusiness] = useState<Business | null | undefined>(
    undefined,
  );
  const { data: hierarchy = [], isLoading } = useAllBusinesses();

  const accessibleIds = new Set(hierarchy.map((business) => business.id));
  const highestLevelBusinesses = hierarchy.filter(
    (business) =>
      business.parent === null || !accessibleIds.has(business.parent),
  );
  const selectedBusiness =
    business === undefined ? (highestLevelBusinesses[0] ?? null) : business;
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
                setBusiness(selected);
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
    </BusinessScopeContext>
  );
}
