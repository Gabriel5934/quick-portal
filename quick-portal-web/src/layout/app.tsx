import { useState, type ReactNode } from "react";
import AppBar from "@mui/material/AppBar";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddBusinessIcon from "@mui/icons-material/AddBusiness";
import StorefrontIcon from "@mui/icons-material/Storefront";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import LogoutIcon from "@mui/icons-material/Logout";
import MenuIcon from "@mui/icons-material/Menu";
import { useTheme } from "@mui/material/styles";
import { Link, useRouterState } from "@tanstack/react-router";
import { useLogout } from "#hooks/auth/useLogout";
import { getUserEmail } from "#hooks/storage";

const DRAWER_WIDTH = 240;
const MINI_DRAWER_WIDTH = 64;

type AppLayoutProps = {
  children: ReactNode;
};

// ``routeId`` is the route whose pages mark the link as current.
const navigation = [
  {
    to: "/sales",
    routeId: "/_authRoutes/_businessRoutes",
    label: "Meus ECs",
    icon: <StorefrontIcon />,
  },
  {
    to: "/novo-ec",
    routeId: "/_authRoutes/novo-ec",
    label: "Novo estabelecimento",
    icon: <AddBusinessIcon />,
  },
] as const;

function NavigationItem({
  item,
  drawerOpen,
}: {
  item: (typeof navigation)[number];
  drawerOpen: boolean;
}) {
  const selected = useRouterState({
    select: (state) =>
      state.matches.some((match) => match.routeId === item.routeId),
  });

  return (
    <ListItem disablePadding>
      <Tooltip title={drawerOpen ? "" : item.label} placement="right">
        <ListItemButton component={Link} to={item.to} selected={selected}>
          <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
          <ListItemText
            primary={item.label}
            sx={{ opacity: drawerOpen ? 1 : 0 }}
          />
        </ListItemButton>
      </Tooltip>
    </ListItem>
  );
}

function emailColor(email: string): string {
  let hash = 0;
  for (const character of email) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return `hsl(${hash % 360} 58% 42%)`;
}

export function AppLayout({ children }: AppLayoutProps) {
  const theme = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const logout = useLogout();
  const drawerWidth = drawerOpen ? DRAWER_WIDTH : MINI_DRAWER_WIDTH;
  const email = getUserEmail() ?? "";
  const initials = email.slice(0, 2).toUpperCase() || "??";

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "grey.50" }}>
      <AppBar position="fixed" sx={{ zIndex: theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton
            size="large"
            edge="start"
            color="inherit"
            aria-label={
              drawerOpen ? "Recolher menu da conta" : "Expandir menu da conta"
            }
            onClick={() => setDrawerOpen((open) => !open)}
            sx={{ mr: 2 }}
          >
            {drawerOpen ? <ChevronLeftIcon /> : <MenuIcon />}
          </IconButton>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Portal Quick
          </Typography>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        open={drawerOpen}
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          whiteSpace: "nowrap",
          "& .MuiDrawer-paper": {
            width: drawerWidth,
            boxSizing: "border-box",
            overflowX: "hidden",
            transition: theme.transitions.create("width", {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.shorter,
            }),
          },
        }}
      >
        <Toolbar />
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1,
              px: 1,
              py: 2,
            }}
          >
            <Tooltip title={drawerOpen ? "" : email} placement="right">
              <Avatar
                aria-label={email ? `Usuário ${email}` : "Usuário autenticado"}
                sx={{ bgcolor: emailColor(email), width: 40, height: 40 }}
              >
                {initials}
              </Avatar>
            </Tooltip>
            {drawerOpen ? (
              <Typography
                variant="body2"
                noWrap
                title={email}
                sx={{ maxWidth: "100%" }}
              >
                {email}
              </Typography>
            ) : null}
          </Box>
          <Divider />
          <List sx={{ flexGrow: 1 }}>
            {navigation.map((item) => (
              <NavigationItem
                key={item.to}
                item={item}
                drawerOpen={drawerOpen}
              />
            ))}
          </List>
          <Divider />
          <List>
            <ListItem disablePadding>
              <Tooltip title={drawerOpen ? "" : "Sair"} placement="right">
                <ListItemButton onClick={() => void logout()}>
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <LogoutIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="Sair"
                    sx={{ opacity: drawerOpen ? 1 : 0 }}
                  />
                </ListItemButton>
              </Tooltip>
            </ListItem>
          </List>
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{
          ml: `${drawerWidth}px`,
          minWidth: 0,
          transition: theme.transitions.create("margin-left", {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.shorter,
          }),
        }}
      >
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
}
