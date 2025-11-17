'use client';

import { useEffect, useRef } from 'react';
import cytoscape, { Core, EventObject } from 'cytoscape';
// @ts-ignore - no types available
import coseBilkent from 'cytoscape-cose-bilkent';
import type { CytoscapeData } from '@/lib/types';

// Register the layout algorithm
if (typeof cytoscape !== 'undefined') {
  cytoscape.use(coseBilkent);
}

interface GraphVisualizationProps {
  data: CytoscapeData;
  onNodeClick?: (nodeId: string) => void;
  selectedNode?: string | null;
}

export function GraphVisualization({
  data,
  onNodeClick,
  selectedNode,
}: GraphVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current || cyRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#3b82f6',
            'label': 'data(label)',
            'color': '#1f2937',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '12px',
            'width': '40px',
            'height': '40px',
            'overlay-padding': '6px',
          },
        },
        {
          selector: 'node:selected',
          style: {
            'background-color': '#ef4444',
            'border-width': '3px',
            'border-color': '#dc2626',
          },
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#9ca3af',
            'target-arrow-color': '#9ca3af',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': '10px',
            'text-rotation': 'autorotate',
            'text-margin-y': -10,
          },
        },
        {
          selector: 'edge:selected',
          style: {
            'line-color': '#3b82f6',
            'target-arrow-color': '#3b82f6',
            'width': 3,
          },
        },
      ],
      layout: {
        name: 'cose-bilkent',
        animate: false,
        nodeDimensionsIncludeLabels: true,
        idealEdgeLength: 100,
        nodeRepulsion: 4500,
        gravity: 0.25,
        numIter: 2500,
      },
      minZoom: 0.1,
      maxZoom: 3,
      wheelSensitivity: 0.2,
    });

    // Handle node clicks
    cy.on('tap', 'node', (evt: EventObject) => {
      const node = evt.target;
      const nodeId = node.id();
      onNodeClick?.(nodeId);
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [onNodeClick]);

  // Update graph data
  useEffect(() => {
    if (!cyRef.current) return;

    const cy = cyRef.current;

    // Update elements
    cy.elements().remove();
    cy.add([...data.nodes, ...data.edges]);

    // Run layout
    const layout = cy.layout({
      name: 'cose-bilkent',
      animate: false,
      nodeDimensionsIncludeLabels: true,
      idealEdgeLength: 100,
      nodeRepulsion: 4500,
      gravity: 0.25,
      numIter: 2500,
    });

    layout.run();

    // Fit to viewport
    cy.fit(undefined, 50);
  }, [data]);

  // Handle selected node highlighting
  useEffect(() => {
    if (!cyRef.current) return;

    const cy = cyRef.current;

    // Remove all selections
    cy.elements().unselect();

    // Select the specified node
    if (selectedNode) {
      const node = cy.getElementById(selectedNode);
      if (node.length > 0) {
        node.select();

        // Center on the selected node
        cy.animate({
          center: { eles: node },
          zoom: 1.5,
          duration: 500,
        });
      }
    }
  }, [selectedNode]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-gray-50"
      data-testid="graph-visualization"
    />
  );
}
