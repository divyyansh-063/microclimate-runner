"use client";

import { useEffect } from "react";
import {
    MapContainer,
    Marker,
    Polyline,
    TileLayer,
    useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Coordinate = {
    latitude: number;
    longitude: number;
};

type RouteMapProps = {
    route: Coordinate[];
    currentPosition?: Coordinate | null;
};

const runnerIcon = L.divIcon({
    className: "runner-map-marker",
    html: "<span>●</span>",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
});

function FitRoute({ coordinates }: { coordinates: Coordinate[] }) {
    const map = useMap();

    useEffect(() => {
        if (coordinates.length === 0) return;

        const bounds = L.latLngBounds(
            coordinates.map((point) => [point.latitude, point.longitude]),
        );

        map.fitBounds(bounds, { padding: [30, 30] });
    }, [coordinates, map]);

    return null;
}

export default function RouteMap({
    route,
    currentPosition,
}: RouteMapProps) {
    if (route.length === 0) return null;

    const routeLine = route.map((point) => [
        point.latitude,
        point.longitude,
    ] as [number, number]);

    const start = route[0];

    return (
        <div className="leaflet-map-wrapper">
            <MapContainer
                center={[start.latitude, start.longitude]}
                zoom={14}
                scrollWheelZoom
                className="leaflet-map"
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <FitRoute coordinates={route} />

                <Polyline
                    positions={routeLine}
                    pathOptions={{
                        color: "#c2613d",
                        weight: 6,
                    }}
                />

                <Marker
                    position={[start.latitude, start.longitude]}
                    title="Run start"
                />

                {currentPosition && (
                    <Marker
                        position={[
                            currentPosition.latitude,
                            currentPosition.longitude,
                        ]}
                        icon={runnerIcon}
                        title="Your current position"
                    />
                )}
            </MapContainer>
        </div>
    );
}